import r from 'rethinkdb';
import Model  from '../Model';
import Role from './Role';
import Grant from './Grant';
import Credential from './Credential';
import Team from './Team';
import validate from '../util/validator';
import * as scopeUtils from '../util/scopes';
import * as errors from '../errors';
import uuid from 'uuid';

const ROLES = Symbol('roles');
const GRANTS = Symbol('grants');
const CREDENTIALS = Symbol('credentials');
const SCOPES = Symbol('scopes');
const TEAM = Symbol('team');

export default class User extends Model {

	static get table() {
		return 'users';
	}



	static async create(conn, data) {
		var now = Date.now() / 1000;
		data = Object.assign({id: uuid.v4(), profile: {}}, data, {created: now, last_updated: now});
		data.profile = data.profile ? Object.assign({}, data.profile) : null;

		// normalize ID
		if (!data.profile || typeof data.profile.id === 'undefined')
			data.profile.id = data.id;

		// validate data
		var err = validate('user', data, {useDefault: true});
		if (err) throw new errors.ValidationError('A valid user must be supplied.', err.validation);
		if (data.profile.id !== data.id) throw new errors.ValidationError('If a profile ID is present, it must match the `id`.');

		// insert the model (use super.create when babel.js supports it)
		return Model.create.call(this, conn, data);
	}



	static async save(conn, id, data) {
		var now = Date.now() / 1000;
		data = Object.assign({id: id, profile: {}}, data, {created: now, last_updated: now});
		data.profile = data.profile ? Object.assign({}, data.profile) : null;

		// normalize ID
		if (!data.profile || typeof data.profile.id === 'undefined')
			data.profile.id = data.id;

		// validate data
		var err = validate('user', data, {useDefault: true});
		if (err) throw new errors.ValidationError('A valid user must be supplied.', err.validation);
		if (data.profile.id !== data.id) throw new errors.ValidationError('If a profile ID is present, it must match the `id`.');
		if (data.id !== id) throw new Error('The supplied `id` did not match the `id` in the data.');

		// don't overwrite an existing `created` timestamp
		data.created = r.row('created').default(data.created);

		// save the model (use super.create when babel.js supports it)
		return Model.save.call(this, conn, id, data);
	}



	static async update(conn, id, data) {
		data = Object.assign({}, data, {last_updated: Date.now() / 1000});

		// validate data
		var err = validate('user', data, {checkRequired: false});
		if (err) throw new errors.ValidationError('A valid user must be supplied.', err.validation);

		// update the model (use super.update when babel.js supports it)
		return Model.update.call(this, conn, id, data);
	}



	static async delete(conn, id) {

		// first delete all credentials
		var credentials = await Credential.query(conn, q => q
			.getAll(id, {index: 'user_id'})
			.delete({returnChanges: 'always'})
			.do(results => r.branch(
				results('deleted').gt(0),
				results('changes').map(d => d('old_val')),
				[]
			))
		);

		// delete the model (use super.update when babel.js supports it)
		var user = await Model.delete.call(this, conn, id);

		// attach the deleted credentials
		user[CREDENTIALS] = Promise.resolve(credentials);

		return user;
	}



	async credentials(refresh) {

		// query the database for credentials
		if (!this[CREDENTIALS] || refresh)
			this[CREDENTIALS] = Credential.query(this[Model.Symbols.CONN], q => q.getAll(this.id, {index: 'user_id'}));

		return this[CREDENTIALS];
	}



	async roles(refresh) {

		// query the database for roles
		if (!this[ROLES] || refresh)
			this[ROLES] = Role.query(this[Model.Symbols.CONN], q => q.getAll(this.id, {index: 'assignments'}));

		return this[ROLES];
	}



	async grants(refresh) {

		// query the database for roles
		if (!this[GRANTS] || refresh)
			this[GRANTS] = Grant.query(this[Model.Symbols.CONN], q => q.getAll(this.id, {index: 'user_id'}));

		return this[GRANTS];
	}



	async team(refresh) {

		// query the database for team
		if (!this[TEAM] || refresh)
			this[TEAM] = this.team_id ? Team.get(this[Model.Symbols.CONN], this.team_id) : null;

		return this[TEAM];
	}



	async scopes(refresh) {
		if (!this[SCOPES] || refresh) {
			let roles = await this.roles();
			let scopes = roles.map(role => role.scopes);

			this[SCOPES] = scopes.reduce((a, b) => a.concat(b), []);
		}

		return this[SCOPES];
	}



	async can(scope, strict) {
		var roles = await this.roles();
		return roles.some(role => role.can(scope, strict));
	}



	async relationshipTo(other) {
		var [myScopes, otherScopes] = await Promise.all([this.scopes(), other.scopes()]);

		if (this.id === other.id)
			return 'self';

		if (myScopes.length === otherScopes.length && myScopes.every(s => otherScopes.indexOf(s) > -1))
			return 'peer';

		var i_can_do_everything_other_can_do = otherScopes.every((s) => scopeUtils.can(myScopes, s));
		var other_can_do_everything_i_can_do = myScopes.every((s) => scopeUtils.can(otherScopes, s));

		if (i_can_do_everything_other_can_do && !other_can_do_everything_i_can_do)
			return 'superior';

		if (!i_can_do_everything_other_can_do && other_can_do_everything_i_can_do)
			return 'subordinate';

		return 'mixed';
	}


}
