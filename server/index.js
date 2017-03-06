import Hull from "hull/src";
import Promise from "bluebird";
import express from "express";

// pick what we need from the hull-node
import { notifHandler, actionHandler, batcherHandler, oAuthHandler } from "hull/src/utils";

import { Strategy as HubspotStrategy } from "passport-hubspot";

const port = process.env.PORT || 8082;
const hostSecret = process.env.SECRET || "1234";

const service = {
  sendUsers: (ctx, users) => {
    users.map(u => {
      console.log(u);
      // console.log(u.segment_ids, u.remove_segment_ids);
    })
    return ctx.enqueue("exampleJob", { users });
  }
}

/**
 * Express application with static routing view engine,
 * can be changed into a decorator/command pattern:
 * patchedExpressApp = WebApp(expressApp);
 * @type {HullApp}
 */
const connector = new Hull.Connector({ port, hostSecret, service });
const app = express();

connector.setupApp(app);

app.use("/fetch-all", actionHandler((ctx, { query, body }) => {
  console.log("fetch-all", ctx.segments.map(s => s.name), { query, body });
  return ctx.enqueue("fetchAll", { body });
}));

app.use("/webhook", batcherHandler((ctx, messages) => {
  console.log("Batcher.messages", messages);
}));

app.use("/notify", notifHandler({
  userHandlerOptions: {
    groupTraits: true,
    maxSize: 200,
    maxTime: 10000
  },
  handlers: {
    "ship:update": (ctx, messages) => {
      console.log("ship was updated");
    },
    "user:update": (ctx, messages) => {
      const { client } = ctx;
      console.log("processing messages", messages.length);
      client.logger.info("user was updated", messages.map(m => m.user.email));
    }
  }
}));

app.use("/auth", oAuthHandler({
  name: "Hubspot",
  Strategy: HubspotStrategy,
  options: {
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    scope: ["offline", "contacts-rw", "events-rw"],
    skipUserProfile: true
  },
  isSetup(req) {
    if (req.query.reset) return Promise.reject();
    if (req.hull.ship.private_settings.token) {
      return Promise.resolve({ settings: req.hull.ship.private_settings });
    }
    return Promise.reject();
  },
  onLogin: (req) => {
    req.authParams = { ...req.body, ...req.query };
    return req.hull.client.updateSettings({
      portal_id: req.authParams.portalId
    });
  },
  onAuthorize: (req) => {
    const { refreshToken, accessToken, expiresIn } = (req.account || {});
    return req.hull.client.updateSettings({
      refresh_token: refreshToken,
      token: accessToken,
      expires_in: expiresIn
    });
  },
  views: {
    login: "login.html",
    home: "home.html",
    failure: "failure.html",
    success: "success.html"
  }
}));

app.get("/request", (req, res) => {
  req.hull.client.utils.extract.request({
      hostname: req.hostname,
      path: "notify",
      fields: ["id", "first_name"]
    })
    .then(() => {
      res.end("ok");
    }, (err) => {
      res.end(err.stack || err);
    })
});

app.get("/properties", (req, res) => {
  req.hull.client.utils.properties.get()
    .then((result) => {
      console.log("RES", result);
      res.json(result);
    }, (err) => {
      res.end(err.stack || err);
    })
});


connector.worker({
  exampleJob: (ctx, { users }) => {
    console.log("exampleJob", users.length);
  },
  fetchAll: (ctx, { body }) => {
    console.log("fetchAllJob", ctx.segments.map(s => s.name), body);
  }
});


connector.startWorker();

connector.startApp(app);
