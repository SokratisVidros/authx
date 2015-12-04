'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _jjv = require('jjv');

var _jjv2 = _interopRequireDefault(_jjv);

var _jsonwebtoken = require('jsonwebtoken');

var _jsonwebtoken2 = _interopRequireDefault(_jsonwebtoken);

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

var _requestPromise = require('request-promise');

var _requestPromise2 = _interopRequireDefault(_requestPromise);

var _errors = require('../errors');

var errors = _interopRequireWildcard(_errors);

var _profile = require('../../schema/profile');

var _profile2 = _interopRequireDefault(_profile);

var _Strategy = require('../Strategy');

var _Strategy2 = _interopRequireDefault(_Strategy);

var _Credential = require('../models/Credential');

var _Credential2 = _interopRequireDefault(_Credential);

var _Role = require('../models/Role');

var _Role2 = _interopRequireDefault(_Role);

var _User = require('../models/User');

var _User2 = _interopRequireDefault(_User);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var env = (0, _jjv2.default)();

env.addSchema({
	id: 'authority',
	type: 'object',
	properties: {
		client_id: {
			type: 'string',
			title: 'Client ID'
		},
		client_secret: {
			type: 'string',
			title: 'Client Secret'
		},
		email_authority_id: {
			type: ['null', 'string'],
			title: 'Email Authority ID',
			description: 'The ID of an email authority with which verified email addresses can be registered.',
			default: null
		},
		email_domains: {
			type: ['null', 'array'],
			title: 'Email Domains',
			description: 'Restrict creation of new users to these domain names. If null, all domains are allowed.',
			items: {
				type: 'string'
			},
			default: null
		},
		role_ids: {
			type: 'array',
			title: 'Role IDs',
			description: 'The IDs of AuthX roles to assign any users verified by this authority.',
			default: []
		}
	},
	required: ['client_id', 'client_secret']
});

env.addSchema({
	id: 'credential',
	type: 'object',
	properties: {}
});

env.addSchema(_profile2.default);

function without(o, key) {
	o = Object.assign({}, o);
	delete o[key];
	return o;
}

class OAuth2Strategy extends _Strategy2.default {

	authenticate(ctx) {
		var _this = this;

		var state, response, profile, err, details, credential, user, email_credential, assignments, parts;
		return regeneratorRuntime.async(function _callee$(_context) {
			while (1) switch (_context.prev = _context.next) {
				case 0:
					if (!ctx.query.code) {
						_context.next = 77;
						break;
					}

					// retrieve the url from the cookie
					ctx.redirect_to = ctx.cookies.get('AuthX/session/' + this.authority.id + '/url');
					ctx.cookies.set('AuthX/session/' + this.authority.id + '/url');

					// retreive the state from the cookie
					state = ctx.cookies.get('AuthX/session/' + this.authority.id + '/state');

					if (!(ctx.query.state !== state)) {
						_context.next = 6;
						break;
					}

					throw new errors.ValidationError('Mismatched state parameter.');

				case 6:
					_context.t0 = JSON;
					_context.next = 9;
					return regeneratorRuntime.awrap((0, _requestPromise2.default)({
						method: 'POST',
						uri: 'https://www.googleapis.com/oauth2/v3/token',
						form: {
							client_id: this.authority.details.client_id,
							client_secret: this.authority.details.client_secret,
							redirect_uri: ctx.request.protocol + '://' + ctx.request.host + ctx.request.path,
							grant_type: 'authorization_code',
							code: ctx.query.code,
							state: state
						}
					}));

				case 9:
					_context.t1 = _context.sent;
					response = _context.t0.parse.call(_context.t0, _context.t1);
					_context.t2 = JSON;
					_context.next = 14;
					return regeneratorRuntime.awrap((0, _requestPromise2.default)({
						method: 'GET',
						uri: 'https://www.googleapis.com/plus/v1/people/me',
						headers: {
							'Authorization': 'Bearer ' + response.access_token
						}
					}));

				case 14:
					_context.t3 = _context.sent;
					profile = _context.t2.parse.call(_context.t2, _context.t3);

					// normalize the profile with our schema
					if (profile.url && !profile.urls) profile.urls = [{ value: profile.url }];

					if (profile.image && profile.image.url && !profile.photos) profile.photos = [{ value: profile.image.url }];

					err = env.validate('profile', profile, { removeAdditional: true });

					if (!err) {
						_context.next = 21;
						break;
					}

					throw new errors.ValidationError('The credential details were invalid.', err.validation);

				case 21:

					// TODO: right now we aren't verifying any of the JWT's assertions! We need to get Google's public
					// keys from https://www.googleapis.com/oauth2/v1/certs (because they change every day or so) and
					// use them to check the JWT's signature. What we're doing here isn't exactly best practice, but the
					// verification step isn't necessary because we just received the token directly (and securely) from
					// Google.

					// decode the JWT
					details = _jsonwebtoken2.default.decode(response.id_token);
					_context.prev = 22;
					_context.next = 25;
					return regeneratorRuntime.awrap(_Credential2.default.update(this.conn, [this.authority.id, details.sub], {
						details: details,
						profile: profile
					}));

				case 25:
					credential = _context.sent;
					_context.next = 28;
					return regeneratorRuntime.awrap(_User2.default.get(this.conn, credential.user_id));

				case 28:
					user = _context.sent;
					_context.next = 35;
					break;

				case 31:
					_context.prev = 31;
					_context.t4 = _context['catch'](22);

					if (_context.t4 instanceof errors.NotFoundError) {
						_context.next = 35;
						break;
					}

					throw _context.t4;

				case 35:
					if (!(!credential && this.authority.details.email_authority_id && details.email && details.email_verified)) {
						_context.next = 56;
						break;
					}

					_context.prev = 36;
					_context.next = 39;
					return regeneratorRuntime.awrap(_Credential2.default.get(this.conn, [this.authority.details.email_authority_id, details.email]));

				case 39:
					email_credential = _context.sent;
					_context.next = 42;
					return regeneratorRuntime.awrap(_User2.default.get(this.conn, email_credential.user_id));

				case 42:
					user = _context.sent;
					_context.next = 45;
					return regeneratorRuntime.awrap(_Credential2.default.create(this.conn, {
						id: [this.authority.id, details.sub],
						user_id: email_credential.user_id,
						details: details,
						profile: profile
					}));

				case 45:
					credential = _context.sent;

					// assign the user to all configured roles
					assignments = {};
					assignments[user.id] = true;
					_context.next = 50;
					return regeneratorRuntime.awrap(Promise.all(this.authority.details.role_ids.map(function (id) {
						return _Role2.default.update(_this.conn, id, {
							assignments: assignments
						});
					})));

				case 50:
					_context.next = 56;
					break;

				case 52:
					_context.prev = 52;
					_context.t5 = _context['catch'](36);

					if (_context.t5 instanceof errors.NotFoundError) {
						_context.next = 56;
						break;
					}

					throw _context.t5;

				case 56:
					if (credential) {
						_context.next = 74;
						break;
					}

					if (!Array.isArray(this.authority.details.email_domains)) {
						_context.next = 61;
						break;
					}

					parts = details.email.split('@');

					if (!(this.authority.details.email_domains.indexOf(parts[parts.length - 1]) === -1)) {
						_context.next = 61;
						break;
					}

					throw new errors.AuthenticationError('The email domain "' + parts[parts.length - 1] + '" is not allowed.');

				case 61:
					_context.next = 63;
					return regeneratorRuntime.awrap(_User2.default.create(this.conn, {
						type: 'human',
						profile: without(profile, 'id')
					}));

				case 63:
					user = _context.sent;
					_context.next = 66;
					return regeneratorRuntime.awrap(_Credential2.default.create(this.conn, {
						id: [this.authority.id, details.sub],
						user_id: user.id,
						details: details,
						profile: profile
					}));

				case 66:
					credential = _context.sent;

					if (!this.authority.details.email_authority_id) {
						_context.next = 70;
						break;
					}

					_context.next = 70;
					return regeneratorRuntime.awrap(_Credential2.default.create(this.conn, {
						id: [this.authority.details.email_authority_id, details.email],
						user_id: user.id,
						profile: null
					}));

				case 70:

					// assign the user to all configured roles
					assignments = {};
					assignments[user.id] = true;
					_context.next = 74;
					return regeneratorRuntime.awrap(Promise.all(this.authority.details.role_ids.map(function (id) {
						return _Role2.default.update(_this.conn, id, {
							assignments: assignments
						});
					})));

				case 74:
					return _context.abrupt('return', user);

				case 77:

					// store the url in a cookie
					ctx.cookies.set('AuthX/session/' + this.authority.id + '/url', ctx.query.url);

					// store the state in a cookie
					state = _crypto2.default.randomBytes(32).toString('base64');

					ctx.cookies.set('AuthX/session/' + this.authority.id + '/state', state);

					// redirect the user to the authorization provider
					ctx.redirect('https://accounts.google.com/o/oauth2/auth?' + _querystring2.default.stringify({
						client_id: this.authority.details.client_id,
						redirect_uri: ctx.request.protocol + '://' + ctx.request.host + ctx.request.path,
						response_type: 'code',
						scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
						state: state
					}));

				case 81:
				case 'end':
					return _context.stop();
			}
		}, null, this, [[22, 31], [36, 52]]);
	}

	// Authority Methods
	// -----------------

	static createAuthority(conn, data) {
		var err;
		return regeneratorRuntime.async(function _callee2$(_context2) {
			while (1) switch (_context2.prev = _context2.next) {
				case 0:

					// validate data
					err = env.validate('authority', data, { useDefault: true });

					if (!err) {
						_context2.next = 3;
						break;
					}

					throw new errors.ValidationError('The authority details were invalid.', err.validation);

				case 3:
					return _context2.abrupt('return', _Strategy2.default.createCredential.call(this, conn, data));

				case 4:
				case 'end':
					return _context2.stop();
			}
		}, null, this);
	}

	static updateAuthority(authority, delta) {
		var err;
		return regeneratorRuntime.async(function _callee3$(_context3) {
			while (1) switch (_context3.prev = _context3.next) {
				case 0:

					// validate data
					err = env.validate('authority', delta, { useDefault: true });

					if (!err) {
						_context3.next = 3;
						break;
					}

					throw new errors.ValidationError('The authority details were invalid.', err.validation);

				case 3:
					return _context3.abrupt('return', _Strategy2.default.updateCredential.call(this, authority, delta));

				case 4:
				case 'end':
					return _context3.stop();
			}
		}, null, this);
	}

	// Credential Methods
	// ------------------

	createCredential(data) {
		var err;
		return regeneratorRuntime.async(function _callee4$(_context4) {
			while (1) switch (_context4.prev = _context4.next) {
				case 0:

					// validate data
					err = env.validate('credential', data, { useDefault: true });

					if (!err) {
						_context4.next = 3;
						break;
					}

					throw new errors.ValidationError('The credential details were invalid.', err.validation);

				case 3:
					return _context4.abrupt('return', _Strategy2.default.prototype.createCredential.call(this, data));

				case 4:
				case 'end':
					return _context4.stop();
			}
		}, null, this);
	}

	updateCredential(credential, delta) {
		var err;
		return regeneratorRuntime.async(function _callee5$(_context5) {
			while (1) switch (_context5.prev = _context5.next) {
				case 0:

					// validate data
					err = env.validate('credential', delta, { useDefault: true });

					if (!err) {
						_context5.next = 3;
						break;
					}

					throw new errors.ValidationError('The credential details were invalid.', err.validation);

				case 3:
					return _context5.abrupt('return', _Strategy2.default.prototype.updateCredential.call(this, credential, delta));

				case 4:
				case 'end':
					return _context5.stop();
			}
		}, null, this);
	}

}
exports.default = OAuth2Strategy;