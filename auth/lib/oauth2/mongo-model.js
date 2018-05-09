/* eslint no-underscore-dangle: off */

const uuid = require('uuid');
const jwt = require('jsonwebtoken');
const ms = require('ms');
const mongoose = require('mongoose');
const { compare } = require('../bcrypt');
const assert = require('../assert-key');

require('./models/mongo/oauth2-client');
require('./models/mongo/oauth2-code');
require('./models/mongo/oauth2-token');

module.exports = class MongoModel {
  constructor(options = {}) {
    assert(options, ['issuer', 'userModel']);

    this.issuer = options.issuer;
    this.model = {
      code: mongoose.connection.model('oauth2-code'),
      token: mongoose.connection.model('oauth2-token'),
      client: mongoose.connection.model('oauth2-client'),
      user: options.userModel,
    };
  }

  async generateAccessToken(client, user, scope) {
    return jwt.sign(
      {
        sub: user.id,
        aud: client.domain,
        scope,
      },
      client.secret,
      {
        jwtid: uuid.v4(),
        issuer: this.issuer,
        expiresIn: ms(client.accessTokenLifetime * 1000),
      },
    );
  }

  async generateRefreshToken(client, user, scope) {
    return jwt.sign(
      {
        sub: user.id,
        aud: client.domain,
        scope,
      },
      client.secret,
      {
        jwtid: uuid.v4(),
        issuer: this.issuer,
        expiresIn: ms(client.refreshTokenLifetime * 1000),
      },
    );
  }

  async getAccessToken(accessToken) {
    const token = await this.model.token.findOne({ accessToken });
    const client = await this.model.client.findOne({ clientId: token.client });
    const user = await this.model.user.findOne({ _id: token.user });

    return {
      accessToken: token.accessToken,
      accessTokenExpiresAt: token.accessTokenExpiresAt,
      scope: token.scope,
      user: {
        id: user._id,
        username: user.username || user.email,
      },
      client: {
        id: client.clientId,
        secret: client.clientSecret,
        domain: client.domain,
      },
    };
  }

  async getRefreshToken(refreshToken) {
    const token = await this.model.token.findOne({ refreshToken });
    const client = await this.model.client.findOne({ _id: token.client });
    const user = await this.model.user.findOne({ _id: token.user });

    return {
      refreshToken: token.refreshToken,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      scope: token.scope,
      user: {
        id: user._id,
        username: user.username || user.email,
      },
      client: {
        id: client.clientId,
        secret: client.clientSecret,
        domain: client.domain,
      },
    };
  }

  async getAuthorizationCode(authorizationCode) {
    const code = await this.model.code.findOne({ code: authorizationCode });
    const client = await this.model.client.findOne({ _id: code.client });
    const user = await this.model.user.findOne({ _id: code.user });

    return {
      code: code.code,
      expiresAt: code.expiresAt,
      redirectUri: code.redirectUri,
      scope: code.scope,
      user: {
        id: user._id,
        username: user.username || user.email,
      },
      client: {
        id: client.clientId,
        secret: client.clientSecret,
        domain: client.domain,
      },
    };
  }

  async getClient(clientId, clientSecret) {
    const client = clientSecret ?
      await this.model.client.findOne({ clientId, clientSecret }) :
      await this.model.client.findOne({ clientId });

    return {
      id: client.clientId,
      secret: client.clientSecret,
      redirectUris: client.redirectUris,
      grants: client.grants,
      accessTokenLifetime: client.accessTokenLifetime,
      refreshTokenLifetime: client.refreshTokenLifetime,
      domain: client.domain,
    };
  }

  async getUser(username, password) {
    const user = await this.model.user.findOne({ email: username });
    return await compare(password, user.password) ?
      {
        id: user._id || user.id,
        username: user.username || user.email,
      } : null;
  }

  async getUserFromClient(client) {
    const authClient = await this.model.client.findOne({ clientId: client.id });
    const user = await this.model.user.findOne({ _id: authClient.user });

    return {
      id: user.id || user._id,
      username: user.username || user.email,
    };
  }

  async saveToken(token, client, user) {
    const {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      scope,
    } = token;

    await this.model.token.create([{
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      scope,
      user: user.id,
      client: client.id,
    }]);

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      scope,
      user,
      client: {
        id: client.clientId,
        secret: client.clientSecret,
        domain: client.domain,
      },
    };
  }

  async saveAuthorizationCode(code, client, user) {
    const {
      authorizationCode,
      expiresAt,
      redirectUri,
      scope,
    } = code;

    await this.model.code.create([{
      authorizationCode,
      expiresAt,
      redirectUri,
      scope,
      client: client.id,
      user: user.id,
    }]);
  }

  async revokeToken(token) {
    const refreshToken = await this.model.token.findOne({ refreshToken: token });

    await this.model.token.deleteOne({ refreshToken: token });

    return !!refreshToken;
  }

  async revokeAuthorizationCode(code) {
    const authcode = await this.model.code.findOne({ code });

    await this.model.code.deleteOne({ code });

    return !!authcode;
  }

  async verifyScope(accessToken, scope) {
    if (!accessToken.scope) {
      return false;
    }

    const requestedScopes = scope.split(' ');
    const authorizedScopes = accessToken.scope.split(' ');

    return requestedScopes.every(s => authorizedScopes.indexOf(s) >= 0);
  }
};
