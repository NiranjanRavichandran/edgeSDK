import Action from 'action-js';
import keyBy from 'lodash/keyBy';
import mergeWith from 'lodash/mergeWith';
import values from 'lodash/values';

import NodesMapper from '../helper/nodes-mapper';
import ApiError from '../helper/api-error';
import { extractToken, addAuthorizationHeader } from '../helper/authorization-helper';

export default class GetMyDrives {
  constructor(getNearByDrives, mpo, http, edge, authorization, userToken) {
    this.getNearByDrives = getNearByDrives;
    this.mpo = mpo;
    this.http = http;
    this.edge = edge;
    this.authorization = authorization;
    this.userToken = userToken;
  }

  static transform(data, edge, authorization) {
    const accountNodes = data.include.devices.data.account;
    const encryptedNodes = accountNodes.cipheredNodes;
    const accessToken = extractToken(authorization);

    // console.log(`authorization: ${authorization}, accessToken: ${accessToken}`);
    if (!accessToken) {
      return new Error('invalid access token format');
    }

    // console.log(`accountNodes: ${JSON.stringify(accountNodes, null, 2)}`);
    // return GetMyDrives.transformMdsNodes(nodes, data.data.avatar);
    return new Action(
      (cb) => {
        const encryptedJson = JSON.stringify(encryptedNodes);
        // console.log(`encryptedJson: ${encryptedJson}`);

        edge.decryptEncryptedNodesJson({
          type: 'account',
          token: accessToken,
          data: encryptedJson,
          success: (result) => {
            cb(result.data);
          },
          error: (err) => {
            cb(new Error(err.message));
          },
        });
      }).next((json) => {
        try {
          const decryptedNodes = JSON.parse(json);
          return decryptedNodes;
        } catch (e) {
          return new Error(e.message);
        }
      }).next((nodes) => {
        const obj = {
          accountId: data.data.id,
          devices: NodesMapper.transformMdsNodes(nodes, data.data.avatar),
        };

        return obj;
      });
  }

  getMpoDevices() {
    const { http, mpo, authorization, userToken, edge } = this;
    const authHeader = addAuthorizationHeader(userToken);
    return new Action(
      (cb) => {
        http.request(({
          url: `${mpo}/users/me?include=devices`,
          authorization: authHeader,
          success: (result) => {
            cb(result.data);
          },
          error: (err) => {
            console.log(`mpo error: ${err.message}`);
            const message = JSON.parse(err.message);
            cb(new ApiError(message.statusCode || 400, err.message));
          },
        }));
      },
    ).next((json) => {
      try {
        const data = JSON.parse(json);
        return data;
      } catch (e) {
        return new Error(e.message);
      }
    }).next(data => GetMyDrives.transform(data, edge, authorization));
  }

  buildAction(_nearbyAction) {
    const account = this.getMpoDevices();
    const nearby = _nearbyAction || this.getNearByDrives.buildAction();

    return Action.parallel([nearby, account], true)
      .next((datas) => {
        const n = datas[0];
        const a = datas[1].devices;
        const accountId = datas[1].accountId;

        const nodes1 = keyBy(n.filter(node => node.accountId === accountId), 'id');
        const nodes2 = keyBy(a, 'id');
        return values(mergeWith(nodes1, nodes2, oldVal => oldVal));

        // return _(n)
        //   .filter(node => node.accountId === accountId)
        //   .keyBy('id')
        //   .mergeWith(_.keyBy(a, 'id'), oldVal => oldVal)
        //   .values();
      });
  }
}
