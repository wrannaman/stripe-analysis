import dotenv from 'dotenv';
import OpenAI from 'openai';
import Stripe from 'stripe';
import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

const stripe = Stripe(process.env['STRIPE_KEY']);

async function getAllCustomers() {
  if (fs.existsSync('customers.json')) {
    return JSON.parse(fs.readFileSync('customers.json'));
  }
  let customers = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const q = { limit: 100, }
    if (startingAfter) q.starting_after = startingAfter
    const response = await stripe.customers.list(q);
    customers = customers.concat(response.data);
    hasMore = response.has_more;
    if (hasMore) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    console.log('got customers', customers.length, 'has more ', hasMore);
  }
  fs.writeFileSync('customers.json', JSON.stringify(customers, null, 2));
  return customers;
}

async function getAllPayments() {
  if (fs.existsSync('payments.json')) {
    return JSON.parse(fs.readFileSync('payments.json'));
  }
  let payments = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const q = { limit: 100, }
    if (startingAfter) q.starting_after = startingAfter
    const response = await stripe.paymentIntents.list(q);
    payments = payments.concat(response.data);
    hasMore = response.has_more;
    if (hasMore) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    console.log('got payments', payments.length, 'has more ', hasMore);
  }
  fs.writeFileSync('payments.json', JSON.stringify(payments, null, 2));
  return payments;
}

async function categorizeCompany(email) {
  try {
    const domain = email.split('@')[1];
    let url = `https://${domain}`;
    let res = null;
    if (!domain) return null
    if (domain.includes('gmail.com')) return null
    if (domain.includes('yahoo.com')) return null
    if (domain.includes('hotmail.com')) return null

    try {
      res = await axios.get(url, { timeout: 7000 });
    } catch (e) {
      res = await axios.get(`https://www.${domain}`, { timeout: 7000 });
    }

    const data = res.data;
    const $ = cheerio.load(data);

    // Get the text content of the body, excluding script and style tags
    $('script').remove();
    $('style').remove();
    let text = $('body').text();

    // Clean up the text
    text = text.replace(/(\r\n|\n|\r|\t)/gm, " ");
    text = text.replace(/\s\s+/g, ' ').trim();
    text = text.slice(0, 1000); // Optionally, limit the text length

    // console.log(domain, "text:", text);

    // Uncomment the following lines if you want to use OpenAI to categorize the text
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user', content: `Categorize the following company. 
        Exclusively output 1 or 2 words that represent the category of business. 
        For instance 'fintech' or 'crypto'. 'technology' is not specific enough. 
        company url ${domain} company website text: ${text}.`
      }],
    });
    console.log(domain, " category ", response.choices[0].message.content)
    return response.choices[0].message.content?.toLowerCase();
  } catch (e) {
    console.error(e?.message);
    return null
  }
}

async function analyzeTopCustomers(customers, payments) {
  // Calculate total spent by each customer
  const customerSpend = customers.map((customer) => {
    const totalSpent = payments
      .filter((payment) => payment.customer === customer.id)
      .reduce((sum, payment) => sum + payment.amount, 0);
    return { customer, totalSpent };
  });

  // Sort customers by total spent
  customerSpend.sort((a, b) => b.totalSpent - a.totalSpent);
  // Get top 100 customers
  const topCustomers = customerSpend.slice(0, 10);
  // console.log("topCustomers:", topCustomers)

  // Categorize top customers
  const categorizedCustomers = [];
  for (const { customer, totalSpent } of topCustomers) {
    const category = await categorizeCompany(customer.email);
    if (!category) continue
    // console.log("category:", category)
    categorizedCustomers.push({ customer, totalSpent, category });
  }

  return categorizedCustomers;
}

async function main() {
  const customers = await getAllCustomers();
  // console.log("customers:", customers)
  const payments = await getAllPayments();
  // console.log("payments:", payments)
  const topCustomers = await analyzeTopCustomers(customers, payments);
  console.log('Top 100 Customers Analysis:', topCustomers);
  const commonalities = {};
  topCustomers.forEach(({ category, customer, totalSpent }) => {
    if (commonalities[category]) {
      commonalities[category].count += 1;
      commonalities[category].totalSpent += totalSpent / 100;
      commonalities[category].customers.push(customer?.email);
    } else {
      commonalities[category] = { count: 1, totalSpent: totalSpent / 100, customers: [customer?.email] };
    }
  });
  console.log('Commonalities Among Top Customers:', commonalities);
}

main();
