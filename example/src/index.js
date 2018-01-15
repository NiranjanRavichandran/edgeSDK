import Router from 'router';
import queryString from 'query-string';
import Action from 'action-js';

import GetNearbyDrives from './get-nearby-drives';


class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code || 500;
  }
}

function mimikInject(context, req) {
  const { MPO, MFD, uMDS, BEAM } = context.env;
  const edge = context.edge;
  const http = context.http;
  const getNearByDrives = new GetNearbyDrives(uMDS, http, edge);
  return ({
    ...context,
    getNearByDrives,
  });
}
const app = Router({
  mergeParams: true,
});

function toJson(obj) {
  return JSON.stringify(obj, null, 2);
}

mimikModule.exports = (context, req, res) => {
//  req.mimikContext = context;
req.mimikContext = mimikInject(context, req);
  res.writeError = (apiError) => {
    res.statusCode = apiError.code;
    const json = JSON.stringify({
      code: apiError.code,
      message: apiError.message,
    });
    res.end(json);
  };

  app(req, res, (e) => {
    const err = (e && new ApiError(400, e.message)) ||
    new ApiError(404, 'not found');
    res.writeError(err);
  });
};

app.get('/drives', (req, res) => {
  const { getNearByDrives } = req.mimikContext;
  const query = queryString.parse(req._parsedUrl.query);
  const type = (query && query.type) || 'nearby';

  let action;
  switch (type) {
    case 'nearby':
    action = getNearByDrives.buildAction();
    break;
    default:
    action = new Action(cb => cb(new Error(`"${type}" type is not supported`)));
    break;
  }

  action
  .next((data) => {
    const dataList = { type, data };
    return toJson(dataList);
  })
  .next(json => res.end(json))
  .guard((err) => {
    console.log(`example ==> ${err.message}`);
    res.writeError(new ApiError(400, err.message));
  })
  .go();
});

app.get('/hello', (req, res) => {
  const json = toJson({
    JSONMessage: 'Hello wORLD!!!',
  });
  res.end(json);
});
