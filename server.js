var express = require('express');
var app = express();
var session = require('express-session');
var MySQLStore = require('express-mysql-session')(session);
var mysql = require('mysql');

const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');

const apiKey = process.env.SHOPIFY_API_KEY; //A serverless.yml file is needed to configure the lambda function and specify the env vars
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = 'read_products';
const forwardingAddress = process.env.FORWARDING_ADDRESS;

const options = {
    checkExpirationInterval: 1000 * 60 * 15, //15 Minutes
    expiration: 1000 * 60 * 60 * 14 * 1, //1 Day
    createDatabaseTable: true
};

const dbConnectionInfo = {
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10
};

const conn = mysql.createPool(dbConnectionInfo);
const sessionStore = new MySQLStore(options, conn);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(session({
    secret: apiSecret,
    name: 'session',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: true,
        httpOnly: true
    }
}));

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(__dirname + '/client/build'));
}

app.get('/app', function(req, res) {
    res.render("index", {
        title: req.session.shop + " - Product Inventory App"
    });
});

app.get('/products', function(req, res, next) {
    if(!req.session.shop || !req.session.access_token) {
        res.status(400).send({ message: "Session Error" });
    }

    const { pageSize, page } = req.query;
    const productsRequestUrl = 'https://' + req.session.shop + '/admin/products.json?limit=' + pageSize + '&page=' + page;
    const productsRequestHeaders = {
        'X-Shopify-Access-Token': req.session.access_token,
    };

    request.get(productsRequestUrl, { headers: productsRequestHeaders })
    .then((productsResponse) => {
        res.status(200).send(JSON.parse(productsResponse).products);
    })
    .catch((error) => {
        next(error);
    });
});

app.get('/products/count', function(req, res, next) {
    if(!req.session.shop || !req.session.access_token) {
        res.status(400).send({ message: "Session Error" });
    }

    const productsRequestUrl = 'https://' + req.session.shop + '/admin/products/count.json';
    const productsRequestHeaders = {
        'X-Shopify-Access-Token': req.session.access_token,
    };

    request.get(productsRequestUrl, { headers: productsRequestHeaders })
    .then((productsResponse) => {
        res.status(200).send(JSON.parse(productsResponse));
    })
    .catch((error) => {
        next(error);
    });
});

app.get('/shopify', (req, res) => {
    const shop = req.query.shop;

    if(shop) {
        const state = nonce();
        const redirectUri = forwardingAddress + '/shopify/callback';
        const installUrl = 'https://' + shop +
        '/admin/oauth/authorize?client_id=' + apiKey +
        '&scope=' + scopes +
        '&state=' + state +
        '&redirect_uri=' + redirectUri;

        res.cookie('state', state);
        res.redirect(installUrl);
    } else {
        return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
    }
});

app.get('/shopify/callback', (req, res, next) => {
    const { shop, hmac, code, state } = req.query;
    const stateCookie = cookie.parse(req.headers.cookie).state;

    if (state !== stateCookie) {
      return res.status(403).send('Request origin cannot be verified');
    }

    if (shop && hmac && code) {
        const map = Object.assign({}, req.query);
        delete map['signature'];
        delete map['hmac'];
        const message = querystring.stringify(map);
        const generatedHash = crypto
            .createHmac('sha256', apiSecret)
            .update(message)
            .digest('hex');

        if (generatedHash !== hmac) {
            return res.status(400).send('HMAC validation failed');
        }

        conn.query({
            sql: 'select access_token from shopifytestapp_access_tokens where shop_name = ?',
            values: [shop]
        }, function(error, results, fields) {
            if(error) next(error);

            if(results.length == 1) {
                req.session.access_token = results[0].access_token;
                req.session.shop = shop;

                req.session.save(function(err) {
                    if(err) next(err);

                    res.redirect('/app');
                });
            } else if(results.length == 0) {
                const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
                const accessTokenPayload = {
                    client_id: apiKey,
                    client_secret: apiSecret,
                    code,
                };

                request.post(accessTokenRequestUrl, { json: accessTokenPayload })
                .then((accessTokenResponse) => {
                    const accessToken = accessTokenResponse.access_token;

                    conn.query({
                        sql: 'insert into shopifytestapp_access_tokens values (?, ?)',
                        values: [shop, accessToken]
                    }, function(error, results, fields) {
                        if(error) {
                            next(error);
                        } else {
                            req.session.access_token = accessToken;
                            req.session.shop = shop;

                            req.session.save(function(err) {
                                if(err) next(err);

                                res.redirect('/app');
                            });
                        }
                    });
                })
                .catch((error) => {
                    next(error);
                });
            } else {
                res.send(400).send("Error retrieving shop data.");
            }
        });
    } else {
      res.status(400).send('Required parameters missing');
    }
});

app.use(function (err, req, res, next) {
    console.error(err);
    res.status(err.status || 500).send({ message: err.message });
});

module.exports = app;