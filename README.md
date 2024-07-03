# Auto analyze and categorize your top customers on Sripe

## Getting started 

### Env variables 
put a `.env`` file in the root directory with the following variables

```bash
OPENAI_API_KEY=sk-...
STRIPE_KEY=rk_live_...
```

```bash
# install dependencies
npm i

# terminal 1 - parcel build
npm run watch 

# terminal 2 - nodemon watch built file
npm run start
```

### Stripe Permissions 
Read only: payment intent, customers, invoices, subscriptions, charges,

