/*
 * Copyright (C) 2017, External Viewpoint Consulting Ltd. UK.
 *
 * All rights reserved.
 *
 * All information contained herein is, and remains the property of External Viewpoint Consulting Ltd. UK
 * and its suppliers, if any. The intellectual and technical concepts contained
 * herein are proprietary to External Viewpoint Consulting Ltd. UK and its suppliers. Dissemination of this
 * information or reproduction of this material is strictly forbidden unless
 * prior written permission is obtained from External Viewpoint Consulting Ltd. UK.
 *
 * RTB.CAT Bidder Frontend
 */

'use strict';
var app = angular.module("app", [
	'ngRoute', 'ngSanitize', 'localytics.directives', 'datatables',
	'angularFileUpload', 'ngCookies', 'angular-loading-bar', 'ngAnimate',
	'ui.sortable', 'chart.js', 'simplePagination'
]);

app.constant('API_HOST', 'https://dsp-api.rtb.cat');

/** Alert service. */
app.service('alerts', function () {
	var alerts = alertify.maxLogItems(1).delay(3000).closeLogOnClick(true);

	this.success = alerts.success;
	this.error = alerts.error;
	this.log = alerts.log;
	this.popAlert = alerts.alert;
});

app.filter("megaNumber", function () {
	return function (number, fractionSize) {
		if (!number)
			return 0;

		if ((fractionSize !== 0 && !fractionSize) || fractionSize < 0)
			fractionSize = 0;

		var abs = Math.abs(number);
		var rounder = Math.pow(10, fractionSize);
		var isNegative = number < 0;
		var key = '';
		var powers = [{
				key: "Q",
				value: Math.pow(10, 15)
			}, {
				key: "T",
				value: Math.pow(10, 12)
			}, {
				key: "B",
				value: Math.pow(10, 9)
			}, {
				key: "M",
				value: Math.pow(10, 6)
			}, {
				key: "K",
				value: 1000
			}];

		for (var i = 0; i < powers.length; i++) {
			var reduced = abs / powers[i].value;

			reduced = Math.round(reduced * rounder) / rounder;

			if (reduced >= 1) {
				abs = reduced;
				key = powers[i].key;
				break;
			}
		}

		return (isNegative ? '-' : '') + (abs + key);
	}
});

/** Session data service. */
app.service('_smsess', function($rootScope, $cookieStore, $location) {
	var self = this;

	var priv = {
		sessid: null,
		userid: null
	};

	/**
	 * sessionId() - get or set session id
	 * @id:		session id, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns
	 *	   the current session id
	 */
	self.sessionId = function(id) {
		if (arguments.length) {
			if (typeof id !== 'string' || id.length < 1)
				id = null;
			var prev = priv.sessid;
			priv.sessid = id;
			if (id == null)
				$cookieStore.remove('sessid');
			else
				$cookieStore.put('sessid', id);
			if (!angular.equals(prev, id))
				$rootScope.$emit('smsess.sessid', id);
		} else {
			return priv.sessid;
		}
	};

	/**
	 * isValid() - test if current session is valid, if any
	 *
	 * Return: %true if current session is valid, %false otherwise
	 */
	self.isValid = function () {
		return priv.sessid != null;
	};

	/**
	 * userId() - get or set user id of this session
	 * @id:		user id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   current user id associated with session
	 */
	self.userId = function(id) {
		if (arguments.length) {
			if (!self.isValid())
				id = null;
			var prev = priv.userid;
			priv.userid = id;
			if (id == null)
				$cookieStore.remove('userid');
			else
				$cookieStore.put('userid', id);
			if (!angular.equals(prev, id))
				$rootScope.$emit('smsess.userid', id);
		} else {
			return priv.userid;
		}
	};

	/**
	 * invalidate() - invalidate the current session (without logout)
	 */
	self.invalidate = function () {
		/*
		 * Unset session cookie, view change will trigger smlogin to
		 * detect and finish redirect process as needed.
		 */
		self.sessionId(null);
		self.userId(null);
		$location.path('/login');
	};

	self.sessionId($cookieStore.get('sessid'));
	self.userId($cookieStore.get('userid'));
});

/** Session service. */
app.service('smsess', function ($rootScope, _smsess, smuser) {
	var self = this;

	var user = null;

	function update() {
		if (!_smsess.isValid()) {
			user = null;
			return;
		}
		smuser.get([
			smuser.field.details,
			smuser.field.email,
			smuser.field.permissions,
			smuser.field.creditLimit,
			smuser.field.creditNetTerm
		]).success(function(usr) {
			usr.id(_smsess.userId());
			user = usr;
			$rootScope.$emit('smsess.user', usr);
		}).send();
	}

	if (_smsess.isValid())
		update();

	$rootScope.$on('smsess.sessid', function(sid) {
		update();
	});

	/**
	 * isValid() - test if current session is valid, if any
	 *
	 * Return: %true if current session is valid, %false otherwise
	 */
	self.isValid = function () {
		return user != null;
	};

	/**
	 * user() - retrieve current session user
	 *
	 * Return: current user instance, or %null
	 */
	self.user = function() {
		return user;
	};

	/**
	 * hasPermission() - test if session user has permission
	 *
	 * Return: %true if user has permission, %false otherwise
	 */
	self.hasPermission = function(perm) {
		return user != null && user.hasPermission(perm);
	};
});

/** API service. */
app.service('smapi', function ($http, _smsess, alerts, API_HOST) {
	var self = this;

	/**
	 * resolve() - resolve API URL
	 * @...:	path segments `string`
	 *
	 * Return: API URL `string`
	 */
	self.resolve = function () {
		var rv = API_HOST;
		for (var i = 0; i != arguments.length; i++)
			rv = rv + arguments[i];
		return rv;
	};

	/**
	 * describeError() - generate an error description based on error
	 *		     result
	 * @err:	error result
	 *
	 * Return: Description `string`
	 */
	self.describeError = function (err) {
		var desc;
		if (err == null) {
			err = 'unknown';
		} else if (typeof err === 'object' &&
			typeof err.errno === 'string') {
			err = err.errno;
		} else if (typeof err === 'object' &&
			typeof err.status === 'number') {
			if (err.status === 0) {
				err = 'connection error, try again';
			} else {
				err = 's' + err.status +
					',m`' + err.statusText + '`';
			}
		}
		if (typeof err === 'string') {
			switch (err) {
				case 'EINVALID':
					desc = 'validate fields';
					break;
				case 'ESYSTEM':
					desc = 'system error';
					break;
				case 'EEXIST':
					desc = 'already exists';
					break;
				case 'ELOGIN':
					desc = 'invalid credentials';
					break;
				case 'ESESSION':
					desc = 'invalid session';
					_smsess.invalidate();
					break;
				default:
					desc = err;
					break;
			}
		} else {
			desc = err;
		}
		return desc;
	};

	/**
	 * Request model.
	 */
	function Request() {
		this.payload = {};
		this.onSuccess = [];
		this.onError = [];
	}
	;

	/**
	 * Request::path() - set request path
	 * @path:	path `string`
	 *
	 * Return: %this
	 */
	Request.prototype.path = function (path) {
		this.path = path;
		return this;
	};

	/**
	 * Request::session() - append session information to request payload
	 *
	 * Return: %this
	 */
	Request.prototype.session = function () {
		this.payload['session_id'] = _smsess.sessionId();
		return this;
	};

	/**
	 * Request::data() - set data field in request payload
	 * @field:	field name `string`
	 * @value:	field value `any`
	 *
	 * Return: %this
	 */
	Request.prototype.data = function (field, value) {
		this.payload[field] = value;
		return this;
	};

	/**
	 * Request::suid() - set substitute user id
	 * @suid:	user id, `number` or `string`
	 *
	 * If the @suid specified is `undefined` or %null, then this results
	 * in a no-op.
	 *
	 * Return: %this
	 */
	Request.prototype.suid = function (suid) {
		if (typeof suid === 'undefined' || suid == null)
			return this;
		return this.data('suid', suid);
	};

	/**
	 * Request::timeout() - set request timeout
	 * @msec:	timeout, in milliseconds, `number`
	 *
	 * Return: %this
	 */
	Request.prototype.timeout = function (msec) {
		this.timeout = msec;
		return this;
	};

	/**
	 * Request::success() - set successful response callback
	 * @fn:		callback function where the first argument is the
	 *		response payload `function(any)`
	 *
	 * Return: %this
	 */
	Request.prototype.success = function (fn) {
		this.onSuccess.push(fn);
		return this;
	};

	/**
	 * Request::error() - set erroneous response callback
	 * @fn:		callback function where the first argument is the
	 *		response payload `function(any)`
	 *
	 * Return: %this
	 */
	Request.prototype.error = function (fn) {
		this.onError.push(fn);
		return this;
	};

	/**
	 * Request::desc() - set request description
	 * @msg:	description `string`
	 *
	 * Return: %this
	 */
	Request.prototype.desc = function (msg) {
		this.what = msg;
		return this;
	};

	/**
	 * Request::background() - mark request as background request
	 *
	 * Return: %this
	 */
	Request.prototype.background = function () {
		this.bg = true;
		return this;
	};

	/**
	 * Request::blob() - mark request as returning blob upon success
	 *
	 * Return: %this
	 */
	Request.prototype.blob = function(m) {
		this.blobres = m;
		return this;
	};

	Request.prototype._onSuccess = function (rv) {
		for (var i = 0; i != this.onSuccess.length; i++) {
			var res = this.onSuccess[i](rv);
			if (typeof res !== 'undefined')
				rv = res;
		}
	};

	Request.prototype._onError = function (err) {
		if (this.onError.length > 0) {
			for (var i = 0; i != this.onError.length; i++) {
				var res = this.onError[i](err);
				if (typeof res !== 'undefined')
					err = res;
			}
			return;
		}

		var desc = self.describeError(err);
		var what = this.what;
		if (typeof what !== 'string')
			what = 'send request';

		alerts.error('Failed to ' + what + ': ' + desc);
	};

	/**
	 * Request::send() - dispatch this request
	 */
	Request.prototype.send = function () {
		var rq = this;
		var cfg = {
			cache: false,
			timeout: this.timeout ? this.timeout : 180000,
			ignoreLoadingBar: this.bg ? true : false
		};
		if (this.blobres)
			cfg.responseType = 'arraybuffer';
		$http.post(self.resolve(this.path), this.payload, cfg).
		then(function (res) {
			if (res.status !== 200) {
				rq._onError(res);
				return;
			}
			if (rq.blobres && res.data instanceof ArrayBuffer) {
				var ct = res.headers('Content-Type');
				if (!ct.startsWith('application/json')) {
					rq._onSuccess(res.data);
					return;
				}
				var data = new DataView(res.data);
				var decoder = new TextDecoder('utf-8');
				res.data = JSON.parse(decoder.decode(data));
			}
			if (res.data.errno != 'ESUCCESS')
				rq._onError(res.data);
			else
				rq._onSuccess(res.data);
		}, function (res) {
			rq._onError(res);
		});
	};

	/**
	 * request() - begin new request
	 *
	 * Return: `Request` instance
	 */
	self.request = function () {
		return new Request();
	};
});

/** User API service. */
app.service('smuser', function (smapi) {
	var self = this;

	self.permission = {
		login: {
			code:	'LOGIN',
			text:	'Login'
		},
		campaign: {
			code:	'CAMPAIGN',
			text:	'Campaign'
		},
		autoApprove: {
			code:	'AUTO_APPROVE',
			text:	'Auto Approval'
		},
		allCampaign: {
			code:	'ALL_CAMPAIGN',
			text:	'All Campaign'
		},
		allApproval: {
			code:	'ALL_APPROVAL',
			text:	'All Approval'
		},
		allUser: {
			code:	'ALL_USER',
			text:	'All User'
		},
		allUserInvoice: {
			code:	'ALL_USER_INVOICE',
			text:	'All User Invoice'
		},
		allUserPayment: {
			code:	'ALL_USER_PAYMENT',
			text:	'All User Payment'
		}
	};

	/** User fields. */
	self.field = {
		permissions:	'permissions',
		email:		'email',
		details:	'details',
		markup:		'markup',
		creditLimit:	'credit_limit',
		creditNetTerm:	'credit_net_term'
	};

	/** User detail fields. */
	self.detailField = {
		firstName:	'first_name',
		lastName:	'last_name',
		company:	'company',
		phone:		'phone',
		address1:	'address1',
		aptSuite:	'apt_suite',
		country:	'country',
		city:		'city',
		state:		'state'
	};

	/** User balance fields. */
	self.balanceField = {
		amount:		'amount'
	};

	/** Invoice state. */
	self.invoiceState = {
		unpaid:		'UNPAID',
		late:		'LATE',
		paid:		'PAID',
		cancelled:	'VOID',
		awaitingSettlement: 'AWAITING_SETTLEMENT'
	};

	/** User invoice item fields. */
	self.invoiceItemField = {
		name:		'name',
		amount:		'amount'
	};

	/** User invoice fields. */
	self.invoiceField = {
		state:		'state',
		dueDate:	'due_date',
		createDate:	'create_date',
		paidDate:	'paid_date',
		credited:	'credited'
	};

	/**
	 * Details - User details model.
	 */
	function Details(model) {
		this.model = model || {};
	}

	/**
	 * Details::firstName() - get or set first name
	 * @name:	first name, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current first name
	 */
	Details.prototype.firstName = function(name) {
		if (arguments.length)
			this.model[self.detailField.firstName] = name;
		else
			return this.model[self.detailField.firstName];
	};

	/**
	 * Details::lastName() - get or set last name
	 * @name:	last name, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current last name
	 */
	Details.prototype.lastName = function(name) {
		if (arguments.length)
			this.model[self.detailField.lastName] = name;
		else
			return this.model[self.detailField.lastName];
	};

	/**
	 * Details::company() - get or set company name
	 * @company:	company name, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current company name
	 */
	Details.prototype.company = function(company) {
		if (arguments.length)
			this.model[self.detailField.company] = company;
		else
			return this.model[self.detailField.company];
	};

	/**
	 * Details::phone() - get or set phone number
	 * @phone:	phone number, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current phone number
	 */
	Details.prototype.phone = function(phone) {
		if (arguments.length)
			this.model[self.detailField.phone] = phone;
		else
			return this.model[self.detailField.phone];
	};

	/**
	 * Details::address1() - get or set first address line
	 * @address1:	first address line, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current first address line
	 */
	Details.prototype.address1 = function(address1) {
		if (arguments.length)
			this.model[self.detailField.address1] = address1;
		else
			return this.model[self.detailField.address1];
	};

	/**
	 * Details::aptSuite() - get or set apt/suite
	 * @aptSuite:	apt/suite, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current apt/suite
	 */
	Details.prototype.aptSuite = function(aptSuite) {
		if (arguments.length)
			this.model[self.detailField.aptSuite] = aptSuite;
		else
			return this.model[self.detailField.aptSuite];
	};

	/**
	 * Details::country() - get or set country code
	 * @country:	country code, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current country code
	 */
	Details.prototype.country = function(country) {
		if (arguments.length)
			this.model[self.detailField.country] = country;
		else
			return this.model[self.detailField.country];
	};

	/**
	 * Details::city() - get or set city code
	 * @city:	city code, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current city code
	 */
	Details.prototype.city = function(city) {
		if (arguments.length)
			this.model[self.detailField.city] = city;
		else
			return this.model[self.detailField.city];
	};

	/**
	 * Details::state() - get or set state code
	 * @state:	state code, `string` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current state code
	 */
	Details.prototype.state = function(state) {
		if (arguments.length)
			this.model[self.detailField.state] = state;
		else
			return this.model[self.detailField.state];
	};

	/**
         * Details::field() - get or set field by name
         * @f:	field name, `string`
         * @v:	value to set to, `any` (optional)
         *
         * Return: If only one argument (field name) is specified, then this
         *	   returns the current value of the field
         */
        Details.prototype.field = function (f, v) {
        	if (arguments.length === 2)
        		this.model[f] = v;
        	else
        		return this.model[f];
        };

        self.Details = Details;

	/**
	 * User - User model.
	 */
	function User(model) {
		this.model = model || {};

		var details = this.details();
		if (typeof details === 'object' &&
		    !(details instanceof Details))
			this.details(new Details(details));
	}

	/**
         * User::id() - get or set id of this user
         * @id:		id, `number` (optional)
         *
	 * Return: If no arguments are specified, then this returns
	 *	   the current id of this user
         */
	User.prototype.id = function(id) {
		if (arguments.length)
			this._id = id;
		else
			return this._id;
	};

	/**
         * User::email() - get or set e-mail address of this user
         * @email:	e-mail address, `string` (optional)
         *
	 * Return: If no arguments are specified, then this returns
	 *	   the current e-mail address of this user
         */
	User.prototype.email = function(email) {
		if (arguments.length)
			this.model[self.field.email] = email;
		else
			return this.model[self.field.email];
	};

	/**
         * User::permissions() - get or set permission set of this user
         * @perms:	permission set, `string` (optional)
         *
	 * Return: If no arguments are specified, then this returns
	 *	   the current permission set of this user
         */
	User.prototype.permissions = function(perms) {
		if (arguments.length)
			this.model[self.field.permissions] = perms;
		else
			return this.model[self.field.permissions];
	};

	/**
	 * User::hasPermission() - test if this user has a permission
	 * @perm:	permission to test for, `string`
	 *
	 * Return: %true if this user has the specified permission
	 */
	User.prototype.hasPermission = function(perm) {
		if (typeof perm === 'object' && perm != null &&
		    typeof perm.code === 'string')
			perm = perm.code;
		var perms = this.permissions();
		for (var i = 0; i != perms.length; i++) {
			if (perms[i] == perm)
				return true;
		}
		return false;
	};

	/**
         * User::details() - get or set details of this user
         * @details:	details, `Details` (optional)
         *
	 * Return: If no arguments are specified, then this returns
	 *	   the current details of this user
         */
	User.prototype.details = function(details) {
		if (arguments.length)
			this.model[self.field.details] = details;
		else
			return this.model[self.field.details];
	};

	/**
	 * User::markup() - get or set markup of this user
	 * @markup:	markup, `number` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current markup of this user
	 */
	User.prototype.markup = function(markup) {
		if (arguments.length)
			this.model[self.field.markup] = markup;
		else
			return this.model[self.field.markup];
	};

	/**
	 * User::creditLimit() - get or set credit limit of this user
	 * @creditLimit:	credit limit, `number` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current credit limit of this user
	 */
	User.prototype.creditLimit = function(creditLimit) {
		if (arguments.length)
			this.model[self.field.creditLimit] = creditLimit;
		else
			return this.model[self.field.creditLimit];
	};

	/**
	 * User::creditNetTerm() - get or set credit net term of this user
	 * @t:		credit net term, `number` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current credit net term of this user
	 */
	User.prototype.creditNetTerm = function(t) {
		if (arguments.length)
			this.model[self.field.creditNetTerm] = t;
		else
			return this.model[self.field.creditNetTerm];
	};

	User.prototype._model = function() {
		var rv = {};
		for (var key in this.model) {
			if (!this.model.hasOwnProperty(key))
				continue;
			var val = this.model[key];
			if (key === self.field.details &&
			    val instanceof Details)
				rv[self.field.details] = val.model;
			else
				rv[key] = val;
		}
		return rv;
	};

	self.User = User;

	/**
	 * Balance - User balance model
	 */
	function Balance(model) {
		this.model = model || {};
	}

	/**
	 * Balance::amount() - get or set balance amount
	 * @amt:	balance amount, `number` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current balance amount
	 */
	Balance.prototype.amount = function(amt) {
		if (arguments.length)
			this.model[self.balanceField.amount] = amt;
		else
			return this.model[self.balanceField.amount];
	};

	self.Balance = Balance;

	/**
	 * UserBalance - User/Balance tuple.
	 */
	function UserBalance(model) {
		if (arguments.length) {
			this._user = typeof model['user'] === 'object' ?
				new User(model['user']) : null;
			this._balance = typeof model['balance'] === 'object' ?
				new Balance(model['balance']) : null;
		} else {
			this._user = null;
			this._balance = null;
		}
	}

	/**
	 * UserBalance::user() - get or set user part of this tuple
	 * @usr:	user, `User` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current user part of this tuple
	 */
	UserBalance.prototype.user = function(usr) {
		if (arguments.length)
			this._user = usr;
		else
			return this._user;
	};

	/**
	 * UserBalance::balance() - get or set balance part of this tuple
	 * @bal:	balance, `Balance` (optional)
	 *
	 * Return: If no arguments are specified, then this returns
	 *	   the current balance part of this tuple
	 */
	UserBalance.prototype.balance = function(bal) {
		if (arguments.length)
			this._balance = bal;
		else
			return this._balance;
	};

	/**
	 * UserBalance::remainingBalance() - get remaining balance
	 *
	 * Return: remaining balance (sum of credit limit and balance amount)
	 */
	UserBalance.prototype.remainingBalance = function() {
		var credit = 0;
		if (this._user && this._user.creditLimit())
			credit += this._user.creditLimit();
		if (this._balance && this._balance.amount())
			credit += this._balance.amount();
		return credit;
	};

	self.UserBalance = UserBalance;

	/**
	 * InvoiceItem - Invoice item model.
	 */
	function InvoiceItem(model) {
		this.model = model || {};
	}

	/**
	 * InvoiceItem::name() - get or set name of this item
	 * @n:		textual description of item, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   name of this item
	 */
	InvoiceItem.prototype.name = function(n) {
		if (arguments.length)
			this.model[self.invoiceItemField.name] = n;
		else
			return this.model[self.invoiceItemField.name];
	};

	/**
	 * InvoiceItem::amount() - get or set monetary amount of this item
	 * @n:		monetary amount, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   monetary amount of this item
	 */
	InvoiceItem.prototype.amount = function(n) {
		if (arguments.length)
			this.model[self.invoiceItemField.amount] = n;
		else
			return this.model[self.invoiceItemField.amount];
	}

	self.InvoiceItem = InvoiceItem;

	function pad0(n, str) {
		while (str.length < n)
			str = '0' + str;
		return str;
	}

	function toInvoiceDate(d) {
		var year = d.getUTCFullYear();
		var month = d.getUTCMonth() + 1;
		var day = d.getUTCDate();
		return pad0(4, year.toString()) +
		       pad0(2, month.toString()) +
		       pad0(2, day.toString());
	}

	function fromInvoiceDate(d) {
		var year = parseInt(d.substring(0, 4), 10);
		var month = parseInt(d.substring(4, 6), 10);
		var day = parseInt(d.substring(6, 8), 10);
		return new Date(Date.UTC(year, month - 1, day));
	}

	/**
	 * Invoice - User invoice model.
	 */
	function Invoice(model) {
		if (typeof model === 'object' && model != null) {
			this.model = model;

			var date = this.dueDate();
			if (typeof date === 'string' ||
			    typeof date === 'number')
				this.dueDate(fromInvoiceDate(date.toString()));
			date = this.paidDate();
			if (typeof date === 'string' ||
			    typeof date === 'number')
				this.paidDate(fromInvoiceDate(date.toString()));
			date = this.createDate();
			if (typeof date === 'string' ||
			    typeof date === 'number')
				this.createDate(fromInvoiceDate(date.toString()));

			var items = model['items'];
			if (typeof items === 'object' && items != null) {
				model['items'] = null;

				this._items = [];
				for (var i = 0; i != items.length; i++)
					this._items.push(new InvoiceItem(items[i]));
			}
		} else {
			this.model = {};
			this._items = null;
		}
	}

	/**
	 * Invoice::id() -get or set id of this invoice
	 * @i:		id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current id
	 *	   of this invoice
	 */
	Invoice.prototype.id = function(i) {
		if (arguments.length)
			this._id = i;
		else
			return this._id;
	};

	/**
	 * Invoice::state()  - get or set state of this invoice
	 * @st:		invoice state, `string` (optional)
	 *
	 * For possible values see %smuser::invoiceState.
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   state of this invoice
	 */
	Invoice.prototype.state = function(st) {
		if (arguments.length)
			this.model[self.invoiceField.state] = st;
		else
			return this.model[self.invoiceField.state];
	};

	/**
	 * Invoice::dueDate() - get or set due date of this invoice
	 * @d:		due date, `Date` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   due date of this invoice
	 */
	Invoice.prototype.dueDate = function(d) {
		if (arguments.length)
			this.model[self.invoiceField.dueDate] = d;
		else
			return this.model[self.invoiceField.dueDate];
	};

	/**
	 * Invoice::createDate() - get or set create date of this invoice
	 * @d:		create date, `Date` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   create date of this invoice
	 */
	Invoice.prototype.createDate = function(d) {
		if (arguments.length)
			this.model[self.invoiceField.createDate] = d;
		else
			return this.model[self.invoiceField.createDate];
	};

	/**
	 * Invoice::paidDate() - get or set paid date of this invoice
	 * @d:		paid date, `Date` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   paid date of this invoice
	 */
	Invoice.prototype.paidDate = function(d) {
		if (arguments.length)
			this.model[self.invoiceField.paidDate] = d;
		else
			return this.model[self.invoiceField.paidDate];
	};

	/**
	 * Invoice::items() - get or set items of this invoice
	 * @d:		items, `InvoiceItem[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   items of this invoice
	 */
	Invoice.prototype.items = function(d) {
		if (arguments.length)
			this._items = d;
		else
			return this._items;
	};

	/**
	 * Invoice::total() - calculate total amount due
	 *
	 * Return: Total amount due
	 */
	Invoice.prototype.total = function() {
		var total = 0.0;
		for (var i = 0; i != this._items.length; i++)
			total += this._items[i].amount();
		return total;
	};

	/**
	 * Invoice::credited() - get or set amount credited to user
	 * @c:		amount, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   amount credited to user
	 */
	Invoice.prototype.credited = function(c) {
		if (arguments.length)
			this.model[self.invoiceField.credited] = c;
		else
			return this.model[self.invoiceField.credited];
	};

	/**
	 * Invoice::_model() - construct raw model of this invoice
	 *
	 * Return: Raw model instance
	 */
	Invoice.prototype._model = function() {
		var rv = {};

		for (var key in this.model) {
			if (!this.model.hasOwnProperty(key))
				continue;
			var value = this.model[key];
			if (value instanceof Date)
				rv[key] = toInvoiceDate(value);
			else
				rv[key] = value;
		}

		if (this._items != null && this._items.length) {
			var items = [];
			for (var i = 0; i != this._items.length; i++)
				items.push(this._items[i].model);
			rv['items'] = items;
		}
		return rv;
	};

	self.Invoice = Invoice;

	/**
	 * get() - retrieve user information
	 * @fields:	list of fields to retrieve `string[]`
	 * @balanceFields: list of balance fields to retrieve `string[]`
	 * @suid:	target user id `number` [optional]
	 *
	 * Return: smapi::Request instance that succeeds with the request user
	 *	   information
	 */
	self.get = function (fields, balanceFields, suid) {
		if (typeof fields !== 'object')
			fields = null;
		if (typeof balanceFields !== 'object')
			balanceFields = null;
		var rq = smapi.request().
			path('/account/get').
			session().
			desc('get user information').
			data('user_fields', fields).
			data('balance_fields', balanceFields);
		if (typeof suid === 'number')
			rq.data('suid', suid);
		return rq.success(function (d) {
			if (balanceFields == null)
				return new User(d['user']);
			if (fields == null)
				return new Balance(d['balance']);
			return new UserBalance(d);
		});
	};

	/**
	 * set() - set user information
	 * @fields:	list of fields to retrieve `string[]`
	 * @suid:	target user id `number` [optional]
	 *
	 * Return: smapi::Request instance that succeeds with the request user
	 *	   information
	 */
	self.set = function (usr, suid) {
		var rq = smapi.request().
			path('/account/set').
			session().
			desc('set user information').
			data('ruser', usr._model());
		if (typeof suid === 'number')
			rq.data('suid', suid);
		return rq;
	};

	/**
	 * list() - list user information
	 * @fields:	list of fields to retrieve `string[]`
	 * @balanceFields: list of balance fields to retrieve `string[]`
	 *
	 * Return: smapi::Request instance that succeeds with an array of
	 *	   user information
	 */
	self.list = function(fields, balanceFields, verified) {
		if (typeof fields !== 'object')
			fields = null;
		if (typeof balanceFields !== 'object')
			balanceFields = null;
		return smapi.request().
			path('/accounts/list').
			session().
			desc('list user accounts').
			data('user_fields', fields).
			data('balance_fields', balanceFields).
			data('verified', verified).
			success(function(data) {
				var rv = [];
				for (var mod of data.entries) {
					var usr = null;
					if (balanceFields == null) {
						usr = new User(mod['user']);
						rv.push(usr);
					} else if (fields == null) {
						rv.push(new Balance(mod['balance']));
					} else {
						var ub = new UserBalance(mod);
						usr = ub.user();
						rv.push(ub);
					}
					usr.id(mod['id']);
				}
				return rv;
			});
	};

	/**
	 * login() - request user login
	 *
	 * Return: smapi::Request instance
	 */
	self.login = function (email, password) {
		return smapi.request().
			path('/account/login').
			data('email', email).
			data('password', password).
			desc('login');
	};

	/**
	 * logout() - request user logout
	 *
	 * Return: smapi::Request instance
	 */
	self.logout = function () {
		return smapi.request().
			path('/account/logout').
			session().
			desc('logout');
	};

	/**
	 * signup() - request user signup
	 *
	 * Return: smapi::Request instance
	 */
	self.signup = function (email, password, details) {
		return smapi.request().
			path('/account/signup').
			desc('signup').
			data('email', email).
			data('password', password).
			data('details', details);
	};

	/**
	 * verify() - request user account verification
	 * @email:	user registration email
	 * @key:	user verification key
	 *
	 * Return: smapi::Request instance
	 */
	self.verify = function (email, key) {
		return smapi.request().
			path('/account/verify').
			desc('verify account').
			data('email', email).
			data('key', key);
	};

	/**
	 * resendVerify() - re-send user account verification email
	 * @email:	user registration email
	 *
	 * Return: smapi::Request instance
	 */
	self.resendVerify = function (email) {
		return smapi.request().
			path('/account/verify/resend').
			desc('resend verification email').
			data('email', email);
	};

	/**
	 * setPassword() - set password for current user
	 * @current:	current password, `string`
	 * @updated:	updated password, `string`
	 *
	 * Return: smapi::Request instance
	 */
	self.setPassword = function(current, updated) {
		return smapi.request().
			path('/account/set/password').
			session().
			desc('password change').
			data('current_password', current).
			data('new_password', updated);
	};

	/**
	 * resetPassword() - reset password
	 * @email:	user e-mail address
	 *
	 * Return: smapi::Request instance
	 */
	self.resetPassword = function(email) {
		return smapi.request().
			path('/account/reset/password').
			desc('password reset').
			data('email', email);
	};

	/**
	 * resetSetPassword() - reset-set password
	 * @emai:	user e-mail address
	 * @key:	reset key
	 * @password:	updated password, `string`
	 *
	 * Return: smapi::Request instance
	 */
	self.resetSetPassword = function(email, key, password) {
		return smapi.request().
			path('/account/reset/set_password').
			desc('password change (reset)').
			data('email', email).
			data('key', key).
			data('password', password);
	};

	function concatInvoiceFields(fields, itemFields) {
		if (typeof itemFields !== 'object' ||
		    itemFields == null || !itemFields.length)
			return fields;
		var rv = [];
		for (var i = 0; i != fields.length; i++)
			rv.push(fields[i]);
		for (var i = 0; i != itemFields.length; i++)
			rv.push('item.' + itemFields[i]);
		return rv;
	}

	/**
	 * getInvoice() - retrieve invoice by id
	 * @id:		invoice id, `number`
	 * @fields:	invoice fields to retrieve, see smuser::invoiceField,
	 *		`string[]`
	 * @itemFields:	invoice item fields to retrieve, see smuser::invoiceItemField,
	 *		`string[]`
	 * @suid:	target user id, `number` (optional)
	 *
	 * At least one of @fields or @itemFields must be specified.
	 *
	 * Return: smapi::Request
	 */
	self.getInvoice = function(id, fields, itemFields, suid) {
		fields = concatInvoiceFields(fields, itemFields);
		return smapi.request().
			path('/account/get/invoice').
			session().
			desc('retrieve invoice').
			data('invoice_id', id).
			data('invoice_fields', fields).
			suid(suid).
			success(function(res) {
				return new Invoice(res['invoice']);
			});
	}

	/**
	 * listInvoices() - list invoices for a single user
	 * @fields:	invoice fields to retrieve, see smuser::invoiceField,
	 *		`string[]`
	 * @itemFields:	invoice item fields to retrieve, see smuser::invoiceItemField,
	 *		`string[]`
	 * @state:	target invoice state, see smuser::invoiceState,
	 *		`string`
	 * @startDate:	start due date, `Date` (optional)
	 * @endDate:	end due date (inclusive), `Date` (optional)
	 * @suid:	target user id, `number` (optional)
	 *
	 * If neither @fields or @itemFields is specified, only invoice ids
	 * will be returned.
	 *
	 * Return: smapi::Request
	 */
	self.listInvoices = function(fields, itemFields, state,
				     startDate, endDate, suid) {
		if (startDate instanceof Date)
			startDate = toInvoiceDate(startDate);
		if (endDate instanceof Date)
			endDate = toInvoiceDate(endDate);
		fields = concatInvoiceFields(fields, itemFields);
		return smapi.request().
			path('/account/list/invoices').
			session().
			desc('list invoices').
			data('invoice_fields', fields).
			data('start_date', startDate).
			data('end_date', endDate).
			data('state', state).
			suid(suid).
			success(function(res) {
				var rv = [];
				var entries = res['entries'];
				for (var i = 0; i != entries.length; i++) {
					var en = entries[i];
					var inv = new Invoice(en['invoice']);
					inv.id(en['id']);
					rv.push(inv);
				}
				return rv;
			});
	};

	/**
	 * voidInvoice() - mark invoice as voided
	 * @id:		invoice id, `number`
	 * @suid:	target user id, `number`
	 *
	 * Return: smapi::Request
	 */
	self.voidInvoice = function(id, suid) {
		return smapi.request().
			path('/account/void/invoice').
			session().
			desc('void invoice').
			data('invoice_id', id).
			suid(suid);
	};

	/**
	 * paidInvoice() - mark invoice as paid
	 * @id:		invoice id, `number`
	 * @paidDate:	date invoice was paid, `Date`
	 * @credit:	iff %true, credit total due to user, `boolean`
	 * @suid:	target user id, `number`
	 *
	 * Return: smapi::Request
	 */
	self.paidInvoice = function(id, paidDate, credit, suid) {
		paidDate = toInvoiceDate(paidDate);
		return smapi.request().
			path('/account/paid/invoice').
			session().
			desc('paid invoice').
			data('invoice_id', id).
			data('paid_date', paidDate).
			data('credit', credit).
			suid(suid);
	};

	/**
	 * createInvoice() - create new invoice
	 * @invoice:	invoice model, `Invoice`
	 * @suid:	target user id
	 *
	 * Return: smapi::Request
	 */
	self.createInvoice = function(invoice, suid) {
		return smapi.request().
			path('/account/create/invoice').
			session().
			desc('create invoice').
			data('invoice', invoice._model()).
			suid(suid);
	};

	/**
	 * renderInvoice() - render user invoice
	 * @id:		invoice id, `number`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: smapi::Request
	 */
	self.renderInvoice = function(id, suid) {
		return smapi.request().
			path('/account/render/invoice').
			session().
			desc('render invoice').
			data('invoice_id', id).
			suid(suid).
			blob(true).
			success(function(arr) {
				return new Blob([arr], { type: 'application/pdf' });
			});
	};

	/**
	 * getBraintreeToken() - retrieve Braintree token
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: smapi::Request
	 */
	self.getBraintreeToken = function(suid) {
		return smapi.request().
			path('/account/get/braintree/token').
			session().
			desc('get Braintree token').
			suid(suid).
			success(function(res) {
				return res['client_token'];
			});
	};

	/**
	 * makeBraintreePayment() - end Braintree transaction
	 * @nonce:	transaction nonce, `string`
	 * @deviceData:	transaction device data, `any`
	 * @amount:	payment amount, `number` (optional)
	 * @invoiceId:	target invoice id, `number` (optional)
	 * @suid:	target user id, `number` (optional)
	 *
	 * Either @amount or @invoiceId must be specified.
	 *
	 * Return: smapi::Request
	 */
	self.makeBraintreePayment = function(nonce, deviceData, amount,
					     invoiceId, suid) {
		return smapi.request().
			path('/account/set/braintree/payment').
			session().
			desc('make Braintree payment').
			suid(suid).
			data('nonce', nonce).
			data('device_data', deviceData).
			data('amount', amount).
			data('invoice_id', invoiceId).
			success(function(res) {
				return res['invoice_id'];
			});
	};
});

/** Campaign API service. */
app.service('smcampaign', function (smapi) {
	var self = this;

	/** Campaign state definitions. */
	self.state = {
		active: 'ACTIVE',
		paused: 'PAUSED',
		archived: 'ARCHIVED',
		dailyBudget: 'DAILY_BUDGET_SPENT',
		totalBudget: 'TOTAL_BUDGET_SPENT',
		accountBudget: 'ACCOUNT_BUDGET_SPENT'
	};

	/** Campaign fields. */
	self.field = {
		name: 'name',
		createdOn: 'created_on',
		state: 'state',
		defaultBid: 'default_bid',
		placementBudget: 'placement_budget',
		dailyBudget: 'daily_budget',
		totalBudget: 'total_budget',
		countries: 'countries',
		iabCats: 'iab_cats',
		exchanges: 'exchanges',
		os: 'os',
		frequencyCap: 'freq_cap',
		frequencyDays: 'freq_days',
		spendPacing: 'spend_pacing'
	};

	/** Campaign spend pacing definitions. */
	self.spendPacing = {
		fast: 'FAST',
		hourly: 'HOURLY'
	};

	/**
	 * Campaign model.
	 */
	function Campaign(model) {
		this.model = model || {};
	}

	/**
	 * Campaign::id() - get or set campaign id
	 * @n:	campaign id, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the campaign id
	 */
	Campaign.prototype.id = function (n) {
		if (arguments.length)
			this._id = n;
		else
			return this._id;
	};

	/**
	 * Campaign::name() - get or set campaign name
	 * @n:		campaign name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the name
	 *	   of this campaign
	 */
	Campaign.prototype.name = function (n) {
		if (arguments.length)
			this.model[self.field.name] = n;
		else
			return this.model[self.field.name];
	};

	/**
	 * Campaign::createdOn() - get or set campaign creation time
	 * @n:		campaign creation Unix timestamp, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the Unix
	 *	   timestamp the campaign was created on
	 */
	Campaign.prototype.createdOn = function (n) {
		if (arguments.length)
			this.model[self.field.createdOn] = n;
		else
			return this.model[self.field.createdOn];
	};

	/**
	 * Campaign::state() - get or set campaign state
	 * @n:		campaign state, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   state of the campaign
	 */
	Campaign.prototype.state = function (n) {
		if (arguments.length)
			this.model[self.field.state] = n;
		else
			return this.model[self.field.state];
	};

	/**
	 * Campaign::isActive() - test if this campaign is in an active state
	 *
	 * Return: %true if this campaign is in an active state
	 */
	Campaign.prototype.isActive = function () {
		var state = this.state();
		return state === self.state.active ||
			state === self.state.dailyBudget ||
			state === self.state.totalBudget ||
			state === self.state.accountBudget;
	};

	/**
	 * Campaign::defaultBid() - get or set default bid of campaign
	 * @n:	campaign default bid, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   default bid of the campaign
	 */
	Campaign.prototype.defaultBid = function (n) {
		if (arguments.length)
			this.model[self.field.defaultBid] = n;
		else
			return this.model[self.field.defaultBid];
	};

	/**
	 * Campaign::placementBudget() - get or set per-placement budget
	 * @n:	campaign per-placement budget, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   per-placement budget of the campaign
	 */
	Campaign.prototype.placementBudget = function (n) {
		if (arguments.length)
			this.model[self.field.placementBudget] = n;
		else
			return this.model[self.field.placementBudget];
	};

	/**
	 * Campaign::dailyBudget() - get or set campaign daily budget
	 * @n:	daily budget, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   daily campaign budget
	 */
	Campaign.prototype.dailyBudget = function (n) {
		if (arguments.length)
			this.model[self.field.dailyBudget] = n;
		else
			return this.model[self.field.dailyBudget];
	};

	/**
	 * Campaign::totalBudget() - get or set campaign total budget
	 * @n:	total budget, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   total campaign budget
	 */
	Campaign.prototype.totalBudget = function (n) {
		if (arguments.length)
			this.model[self.field.totalBudget] = n;
		else
			return this.model[self.field.totalBudget];
	};

	/**
	 * Campaign::countries() - get or set country list
	 * @n:	alpha-3 country code list, `string[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the campaign
	 *	   alpha-3 country code list
	 */
	Campaign.prototype.countries = function (n) {
		if (arguments.length)
			this.model[self.field.countries] = n;
		else
			return this.model[self.field.countries];
	};

	/**
	 * Campaign::iabCats() - get or set IAB categories
	 *
	 * Return: if no arguments are specified, this returns the
	 * campaign IAB categories
	 */
	Campaign.prototype.iabCats = function (n) {
		if (arguments.length)
			this.model[self.field.iabCats] = n;
		else
			return this.model[self.field.iabCats];
	}

	/**
	 * Campaign::exchanges() - get or set exchange list
	 * @n:	exchange list, `string[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the campaign
	 *	   exchange list
	 */
	Campaign.prototype.exchanges = function (n) {
		if (arguments.length)
			this.model[self.field.exchanges] = n;
		else
			return this.model[self.field.exchanges];
	};

	/**
	 * Campaign::os() - get or set OS code
	 * @n:	OS code, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the campaign
	 *	   OS code
	 */
	Campaign.prototype.os = function (n) {
		if (arguments.length)
			this.model[self.field.os] = n;
		else
			return this.model[self.field.os];
	};

	/**
	 * Campaign::frequencyCap() - get or set frequency capping
	 * @n:	per-user frequency cap, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   per-user frequency cap of the campaign
	 */
	Campaign.prototype.frequencyCap = function (n) {
		if (arguments.length)
			this.model[self.field.frequencyCap] = n;
		else
			return this.model[self.field.frequencyCap];
	};

	/**
	 * Campaign::frequencyDays() - get or set frequency capping retention
	 *			       days
	 * @n:	per-user frequency cap retention days, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the per-user
	 *	   frequency capping retention days of the campaign
	 */
	Campaign.prototype.frequencyDays = function (n) {
		if (arguments.length)
			this.model[self.field.frequencyDays] = n;
		else
			return this.model[self.field.frequencyDays];
	};

	/**
	 * Campaign::autoBid() - get or set auto-bid state of this campaign
	 * @n:	%true for auto-bid, `boolean` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   auto-bid state of this campaign.
	 */
	Campaign.prototype.autoBid = function(n) {
		if (arguments.length)
			this.defaultBid(n ? -1 : 1);
		else
			return this.defaultBid() == -1;
	};

	/**
	 * Campaign::spendPacing() - get or set spend pacing of this campaign
	 * @n:	spend pacing, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   spend-pacing of this campaign.
	 */
	Campaign.prototype.spendPacing = function(n) {
		if (arguments.length)
			this.model[self.field.spendPacing] = n;
		else
			return this.model[self.field.spendPacing];
	}

	/**
	 * field() - get or set field by name
	 * @f:	field name, `string`
	 * @v:	value to set to, `any` (optional)
	 *
	 * Return: If only one argument (field name) is specified, then this
	 *	   returns the current value of the field
	 */
	Campaign.prototype.field = function (f, v) {
		if (arguments.length === 2)
			this.model[f] = v;
		else
			return this.model[f];
	};

	self.Campaign = Campaign;

	/** Item state. */
	self.itemState = {
		active: 'ACTIVE',
		paused: 'PAUSED',
		archived: 'ARCHIVED',
		unapproved: 'UNAPPROVED'
	};

	function itemField(model, f, v) {
		var idx = f.indexOf('.');
		if (idx !== -1) {
			var obj = f.substring(0, idx);
			f = f.substring(idx + 1);
			if (typeof model[obj] === 'undefined' ||
				model[obj] == null) {
				if (typeof v === 'undefined')
					return;
				model = model[obj] = {};
			} else {
				model = model[obj];
			}
		}
		if (typeof v !== 'undefined')
			model[f] = v;
		else
			return model[f];
	}

	/** Link fields. */
	self.linkField = {
		name: 'name',
		state: 'state',
		url: 'link.url',
		adomain: 'link.adomain',
		value: 'link.value'
	};

	/**
	 * Link - campaign link model
	 */
	function Link(model) {
		this.model = model || {};
	}

	/**
	 * Link::id() - get or set link id
	 * @n:	link id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   link id
	 */
	Link.prototype.id = function (n) {
		if (arguments.length)
			this._id = n;
		else
			return this._id;
	};

	/**
	 * Link::name() - get or set link name
	 * @n:	link name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   link name
	 */
	Link.prototype.name = function (n) {
		return itemField(this.model, self.linkField.name, n);
	};

	/**
	 * Link::state() - get or set link state
	 * @n:	link state, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   link state
	 */
	Link.prototype.state = function (n) {
		return itemField(this.model, self.linkField.state, n);
	};

	/**
	 * Link::url() - get or set link url
	 * @n:	link URL, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   link URL
	 */
	Link.prototype.url = function (n) {
		return itemField(this.model, self.linkField.url, n);
	};

	/**
	 * Link::adomain() - get or set link advertiser domain
	 * @n:	link advertiser domain, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   link advertiser domain
	 */
	Link.prototype.adomain = function (n) {
		return itemField(this.model, self.linkField.adomain, n);
	};

	/**
	 * Link::value() - get or set link value
	 * @n:	link value, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   link value
	 */
	Link.prototype.value = function (n) {
		return itemField(this.model, self.linkField.value, n);
	};

	self.Link = Link;

	self.creativeField = {
		name: 'name',
		state: 'state',
		mime: 'creative.mime',
		text: 'creative.text',
		html: 'creative.html',
		image: 'creative.image',
		attrs: 'creative.attrs',
		api: 'creative.api'
	};

	/**
	 * Text - Text creative model
	 */
	function Text(text) {
		if (typeof text !== 'undefined' && text != null) {
			this._text = text;
		}
	}

	/**
	 * Text::text() - get or set model text
	 * @n:	text string, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   text content.
	 */
	Text.prototype.text = function (n) {
		if (arguments.length)
			this._text = n;
		else
			return this._text;
	};

	self.Text = Text;

	/**
	 * Html - Html creative model
	 */
	function Html(model) {
		if (typeof model !== 'undefined' && model != null) {
			this._width = model['width'];
			this._height = model['height'];
			this._previewUrl = model['preview_url'];
			this._secure = model['secure'];
			this._api = model['api'];
		}
	}

	/**
	 * Html::width() - get or set content width
	 * @n:	width, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   content width
	 */
	Html.prototype.width = function (n) {
		if (arguments.length)
			this._width = n;
		else
			return this._width;
	};

	/**
	 * Html::height() - get or set content height
	 * @n:	height, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   content height
	 */
	Html.prototype.height = function (n) {
		if (arguments.length)
			this._height = n;
		else
			return this._height;
	};

	/**
	 * Html::previewUrl() - get or set content preview url
	 * @n:	preview url, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   preview url
	 */
	Html.prototype.previewUrl = function (n) {
		if (arguments.length) {
			this._previewUrl = n;
		} else {
			var rv = this._previewUrl;
			if (rv.indexOf('http://') === -1 &&
			    rv.indexOf('https://') === -1)
				rv = 'http://' + rv;
			return rv;
		}
	};

	/**
	 * Html::secure() - get or set secure flag
	 * @n:	%true if secure (HTTPS), otherwise %false, `bool` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   secure flag
	 */
	Html.prototype.secure = function (n) {
		if (arguments.length)
			this._secure = n;
		else
			return this._secure;
	};

	/**
	 * Html::api() - get or set required API
	 * @n:	API code, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   API code
	 */
	Html.prototype.api = function (n) {
		if (arguments.length)
			this._api = n;
		else
			return this._api;
	};

	Html.prototype._model = function () {
		var rv = {};
		if (this._width)
			rv['width'] = this._width;
		if (this._height)
			rv['height'] = this._height;
		if (this._previewUrl)
			rv['preview_url'] = this._previewUrl;
		if (this._secure)
			rv['secure'] = this._secure;
		if (this._api)
			rv['api'] = this._api;
		return rv;
	};

	self.Html = Html;

	/**
	 * Image - image model
	 */
	function Image(model) {
		if (typeof model !== 'undefined' && model != null) {
			this._width = model['width'];
			this._height = model['height'];
		}
	}

	/**
	 * Image::width() - get or set image width
	 * @n:	width, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   current width
	 */
	Image.prototype.width = function (n) {
		if (arguments.length)
			this._width = n;
		else
			return this._width;
	};

	/**
	 * Image::height() - get or set image height
	 * @n:	height, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   current height
	 */
	Image.prototype.height = function (n) {
		if (arguments.length)
			this._height = n;
		else
			return this._height;
	};

	Image.prototype._model = function () {
		var rv = {};
		if (typeof this._width === 'number')
			rv['width'] = this._width;
		if (typeof this._height === 'number')
			rv['height'] = this._height;
		return rv;
	};

	self.Image = Image;

	/**
	 * Creative - campaign creative model
	 */
	function Creative(model) {
		this.model = model || {};
	}

	/**
	 * Creative::id() - get or set id
	 * @n:	id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current id
	 */
	Creative.prototype.id = function (n) {
		if (arguments.length)
			this._id = n;
		else
			return this._id;
	};

	/**
	 * Creative::name() - get or set name
	 * @n:	name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   name
	 */
	Creative.prototype.name = function (n) {
		return itemField(this.model, self.creativeField.name, n);
	};

	/**
	 * Creative::state() - get or set state
	 * @n:	state, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   state
	 */
	Creative.prototype.state = function (n) {
		return itemField(this.model, self.creativeField.state, n);
	};

	/**
	 * Creative::mime() - get or set mime
	 * @n:	mime, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   mime
	 */
	Creative.prototype.mime = function (n) {
		return itemField(this.model, self.creativeField.mime, n);
	};

	/**
	 * Creative::text() - get or set text model
	 * @n:	text model, `Text` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   text model
	 */
	Creative.prototype.text = function (n) {
		return itemField(this.model, self.creativeField.text, n);
	};

	/**
	 * Creative::attrs() - get or set creative attributes
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   attributes set
	 */
	Creative.prototype.attrs = function (n) {
		return itemField(this.model, self.creativeField.attrs, n);
	};

	/**
	 * Creative::api() - get or set creative api (mraid, vpaid etc)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   api value
	 */
	Creative.prototype.api = function (n) {
		return itemField(this.model, self.creativeField.api, n);
	};

	/**
	 * Creative::html() - get or set html model
	 * @n:	html model, `Html` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   html model
	 */
	Creative.prototype.html = function (n) {
		return itemField(this.model, self.creativeField.html, n);
	};

	/**
	 * Creative::image() - get or set image model
	 * @n:	image model, `Image` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   image model
	 */
	Creative.prototype.image = function (n) {
		return itemField(this.model, self.creativeField.image, n);
	};

	Creative.prototype._model = function () {
		var rv = {};
		for (var key in this.model) {
			if (!this.model.hasOwnProperty(key))
				continue;
			var val = this.model[key];
			if (key !== 'creative') {
				rv[key] = val;
				continue;
			}
			var c = {};
			for (var k in val) {
				if (!val.hasOwnProperty(k))
					continue;
				var v = val[k];
				if (typeof v === 'undefined' || v == null)
					continue;
				switch (k) {
					case 'html':
					case 'image':
						c[k] = v._model();
						break;
					case 'text':
						c[k] = v.text();
						break;
					default:
						c[k] = v;
				}
			}
			rv['creative'] = c;
		}
		return rv;
	};

	self.Creative = Creative;

	self.ruleConditionField = {
		field: 'field',
		type: 'type',
		value: 'value'
	};

	self.ruleConditionType = {
		'eq': 'EQUALITY',
		'ne': 'UNEQUALITY',
		'li': 'LIKE',
		'nl': 'UNLIKE',
		'gt': 'GREATER_THAN',
		'lt': 'LESS_THAN'
	};

	/**
	 * RuleCondition - rule condition model
	 */
	function RuleCondition(model) {
		this.model = model || {};
	}

	/**
	 * RuleCondition::field() - get or set target impression field
	 * @n:	field name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   impression field name
	 */
	RuleCondition.prototype.field = function (n) {
		if (arguments.length)
			this.model[self.ruleConditionField.field] = n;
		else
			return this.model[self.ruleConditionField.field];
	};

	/**
	 * RuleCondition::type() - get or set condition to test
	 * @n:	condition type, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   condition type
	 */
	RuleCondition.prototype.type = function (n) {
		if (arguments.length)
			this.model[self.ruleConditionField.type] = n;
		else
			return this.model[self.ruleConditionField.type];
	};

	/**
	 * RuleCondition::value() - get or set condition operand
	 * @n:	condition operand, `any` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   condition operand
	 */
	RuleCondition.prototype.value = function (n) {
		if (arguments.length)
			this.model[self.ruleConditionField.value] = n;
		else
			return this.model[self.ruleConditionField.value];
	};

	/**
	 * RuleCondition::fieldGS() - get or set condition field
	 * @f:	field name, `string`
	 * @v:	field value, `any` (optional)
	 *
	 * Return: If only one argument is specified (field name), then this
	 *	   returns the current value of the field
	 */
	RuleCondition.prototype.fieldGS = function (f, v) {
		if (arguments.length === 2)
			this.model[f] = v;
		else
			return this.model[f];
	};

	RuleCondition.prototype._model = function () {
		var rv = {};
		var m = this.model;
		for (var key in m) {
			if (!m.hasOwnProperty(key))
				continue;
			rv[key] = m[key];
		}
		return rv;
	};

	self.RuleCondition = RuleCondition;

	self.ruleField = {
		name: 'name',
		conditions: 'conditions',
		bid: 'bid'
	};

	/**
	 * Rule - Campaign rule model
	 */
	function Rule(model) {
		this.model = model || {};
	}

	/**
	 * Rule::name() - get or set rule name
	 * @n:	name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the rule name
	 */
	Rule.prototype.name = function (n) {
		if (arguments.length)
			this.model[self.ruleField.name] = n;
		else
			return this.model[self.ruleField.name];
	};

	/**
	 * Rule::conditions() - get or set rule conditions
	 * @n:	conditions, `RuleCondition[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the rule
	 *	   condition set
	 */
	Rule.prototype.conditions = function (n) {
		if (arguments.length)
			this.model[self.ruleField.conditions] = n;
		else
			return this.model[self.ruleField.conditions];
	};

	/**
	 * Rule::bid() - get or set rule bid
	 * @n:	bid value, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the rule
	 *	   bid value
	 */
	Rule.prototype.bid = function (n) {
		if (arguments.length)
			this.model[self.ruleField.bid] = n;
		else
			return this.model[self.ruleField.bid];
	};

	/**
	 * Rule::field() - get or set rule field
	 * @f:	field name, `string`
	 * @v:	field value, `any` (optional)
	 *
	 * Return: If only a single argument is specified (field name), this
	 *	   returns the current field value
	 */
	Rule.prototype.field = function (f, v) {
		if (arguments.length === 2)
			this.model[f] = v;
		else
			return this.model[f];
	};

	Rule.prototype._model = function () {
		var rv = {};
		var m = this.model;
		for (var key in m) {
			if (!m.hasOwnProperty(key))
				continue;
			var v = m[key];
			if (key === self.ruleField.conditions) {
				var n = [];
				for (var i = 0; i != v.length; i++)
					n.push(v[i]._model());
				rv[key] = n;
			} else {
				rv[key] = v;
			}
		}
		return rv;
	};

	Rule.prototype.test = function (rule, req) {
		var rKeys = Object.keys(req);

		var matches = 0;
		var fields = [];
		for (var c of rule.conditions()) {
			var field = c.field();
			if (fields.indexOf(field) === -1)
				fields.push(field);

			if (req[field] == null)
				return false; /* field not present in req */

			switch (c.type()) {
				case self.ruleConditionType.eq:
					if (c.value() == req[field])
						matches++;
					break;
				case self.ruleConditionType.neq:
					if (c.value() != req[field])
						matches++;
					break;
				case self.ruleConditionType.gt:
					if (c.value() <= req[field])
						matches++;
					break;
				case self.ruleConditionType.lt:
					if (c.value() >= req[field])
						matches++;
					break;
				default:
					console.log("Unimpl " + c.type());
					return false;
			}
		}

		return (matches == fields.length);
	};

	self.Rule = Rule;

	/**
	 * setState() - set campaign state
	 * @cid:	target campaign id, `number`
	 * @st:		target state, `string`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.setState = function (cid, st, suid) {
		return smapi.request().
			path('/campaign/set/state').
			desc('update campaign state').
			session().
			suid(suid).
			data('cid', cid).
			data('state', st);
	};

	/**
	 * set() - set campaign
	 * @campaign:	campaign model
	 * @suid:	target user, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.set = function (campaign, suid) {
		var rq = smapi.request().
			path('/campaign/set').
			desc('update campaign').
			session().
			suid(suid).
			data('cid', campaign.id()).
			data('campaign', campaign.model);
		return rq.success(function (res) {
			var rv = new Campaign(res['campaign']);
			rv.id(campaign.id());
			return rv;
		});
	};

	/**
	 * get() - retrieve campaign data
	 * @id:		campaign id
	 * @cfields:	campaign field names, `string[]`
	 * @sfields:	campaign spend field names, `string[]`
	 * @suid:	target user id, `string` or `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.get = function (id, cfields, sfields, suid) {
		var rq = smapi.request().
			path('/campaign/get').
			desc('retrieve campaign').
			session().
			suid(suid).
			data('cid', id);
		if (cfields != null && cfields.length > 0)
			rq.data('campaign_fields', cfields);
		if (sfields != null && sfields.length > 0)
			rq.data('spend_fields', sfields);
		return rq.success(function (res) {
			var rv = {};
			if (typeof res.campaign === 'object') {
				rv.campaign = new Campaign(res['campaign']);
				rv.campaign.id(id);
			}

			return rv;
		});
	};

	/**
	 * create() - create campaign
	 * @campaign:	campaign model
	 * @suid:	target user, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.create = function (campaign, suid) {
		var rq = smapi.request().
			path('/campaign/create').
			desc('create campaign').
			session().
			suid(suid).
			data('campaign', campaign);
		return rq.success(function (res) {
			var rv = new Campaign(res['campaign']);
			rv.id(res['cid']);
			return rv;
		});
	};

	/**
	 * list() - list campaigns
	 * @cfields:	fields to retrieve, `string[]`
	 * @sfields:	spend fields to retrieve, `string[]`
	 * @state:	target campaign state, `string`
	 * @suid:	target user id, `string` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.list = function (cfields, sfields, state, suid) {
		var rq = smapi.request().
			path('/campaigns/list').
			session().
			desc('list campaigns').
			suid(suid);
		if (cfields != null && cfields.length > 0)
			rq.data('campaign_fields', cfields);
		if (sfields != null && sfields.length > 0)
			rq.data('spend_fields', sfields);
		if (typeof state === 'string')
			rq.data('state', state);
		return rq.success(function (data) {
			var rv = [];
			var entries = data['entries'];
			for (var i = 0; i != entries.length; i++) {
				var en = entries[i];
				var ren = {};
				if (typeof en['campaign'] === 'object') {
					var c = new Campaign(en['campaign']);
					c.id(en['cid']);
					ren.campaign = c;
				}
				rv.push(ren);
			}
			return rv;
		});
	};

	/**
	 * createLink() - create campaign link
	 * @cid:	target campaign id, `number`
	 * @link:	link to create, `smcampaign::Link`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.createLink = function (cid, link, suid) {
		return smapi.request().
			path('/campaign/create/link').
			session().
			desc('create link').
			suid(suid).
			data('cid', cid).
			data('item', link.model).
			success(function (res) {
				var rv = new Link(res['item']);
				rv.id(res['iid']);
				return rv;
			});
	};

	/**
	 * getLink() - retrieve campaign link
	 * @cid:	campaign id, `number`
	 * @iid:	link id, `number`
	 * @fields:	link fields to retrieve, `string[]`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.getLink = function (cid, iid, fields, suid) {
		return smapi.request().
			path('/campaign/get/link').
			session().
			desc('retrieve link').
			suid(suid).
			data('cid', cid).
			data('iid', iid).
			data('fields', fields).success(function (res) {
			var item = res['item'];
			var rv = new Link(item);
			rv.id(iid);
			return rv;
		});
	};

	/**
	 * setLink() - update campaign link
	 * @cid:	campaign id, `number`
	 * @link:	new link model, `Link`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.setLink = function (cid, link, suid) {
		return smapi.request().
			path('/campaign/set/link').
			session().
			desc('update link').
			suid(suid).
			data('cid', cid).
			data('iid', link.id()).
			data('item', link.model);
	};

	/**
	 * setLinkState() - update campaign link state
	 * @cid:	campaign id, `number`
	 * @iid:	link id, `number`
	 * @state:	new state,
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.setLinkState = function (cid, iid, state, suid) {
		return smapi.request().
			path('/campaign/set/link/state').
			desc('set link state').
			session().
			suid(suid).
			data('cid', cid).
			data('iid', iid).
			data('state', state);
	};

	/**
	 * listLinks() - list campaign links
	 * @cid:	target campaign id, `number`
	 * @fields:	fields to retrieve, `string[]` (optional)
	 * @state:	target link state, `string` (optional)
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.listLinks = function (cid, fields, state, suid) {
		var rq = smapi.request().
			path('/campaign/list/links').
			session().
			desc('list links').
			suid(suid).
			data('state', state).
			data('cid', cid);
		if (typeof fields === 'object' && fields != null)
			rq.data('fields', fields);
		return rq.success(function (data) {
			var rv = [];
			var entries = data['entries'];
			for (var i = 0; i != entries.length; i++) {
				var en = entries[i];
				var link = new Link(en['item']);
				link.id(en['id']);
				rv.push(link);
			}
			return rv;
		});
	};

	function adaptCreative(item) {
		var rv = new Creative(item);

		var content = rv.text();
		if (typeof content === 'string') {
			rv.text(new Text(content));
		} else if (typeof (content = rv.html()) === 'object' &&
			content != null) {
			rv.html(new Html(content));
		} else if (typeof (content = rv.image()) === 'object' &&
			content != null) {
			rv.image(new Image(content));
		}
		return rv;
	}

	/**
	 * listCreatives() - list campaign creatives
	 * @cid:	target campaign id, `number`
	 * @fields:	creative fields to retrieve, `string[]` (optional)
	 * @suid:	target user id, `number` (optional)
	 */
	self.listCreatives = function (cid, fields, suid) {
		var rq = smapi.request().
			path('/campaign/list/creatives').
			desc('list creatives').
			session().
			suid(suid).
			data('cid', cid);
		if (typeof fields !== 'undefined' && fields != null &&
			fields.length)
			rq.data('fields', fields);
		return rq.success(function (res) {
			var entries = res['entries'];
			var rv = [];
			for (var i = 0; i != entries.length; i++) {
				var entry = entries[i];
				var item = entry['item'];
				var cr = adaptCreative(item);
				cr.id(entry['id']);
				rv.push(cr);
			}
			return rv;
		});
	};

	/**
	 * getCreative() - retrieve campaign creative
	 * @cid:	target campaign id, `number`
	 * @iid:	target creative id, `number`
	 * @fields:	creative fields to retrieve, `string[]`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.getCreative = function (cid, iid, fields, suid) {
		return smapi.request().
			path('/campaign/get/creative').
			desc('retrieve creative').
			session().
			suid(suid).
			data('cid', cid).
			data('iid', iid).
			data('fields', fields).
			success(function (res) {
				var cr = adaptCreative(res['item']);
				cr.id(iid);
				return cr;
			});
	};

	/**
	 * setCreative() - update campaign creative
	 * @cid:	target campaign id, `number`
	 * @cr:		new creative model, `Creative`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.setCreative = function (cid, cr, suid) {
		return smapi.request().
			path('/campaign/set/creative').
			desc('update creative').
			session().
			suid(suid).
			data('cid', cid).
			data('iid', cr.id()).
			data('item', cr._model());
	};

	/**
	 * setCreativeState() - update campaign creative state
	 * @cid:	target campaign id, `number`
	 * @iid:	target creative id, `number`
	 * @state:	new state, `string`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.setCreativeState = function (cid, iid, state, suid) {
		return smapi.request().
			path('/campaign/set/creative/state').
			desc('set creative state').
			session().
			suid(suid).
			data('cid', cid).
			data('iid', iid).
			data('state', state);
	};

	/**
	 * createCreative() - insert creative for campaign
	 * @cid:	target campaign id, `number`
	 * @creative:	creative model, `Creative`
	 * @data:	creative data, `string` (optional)
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.createCreative = function (cid, creative, data, suid) {
		var rq = smapi.request().
			path('/campaign/create/creative').
			desc('upload creative').
			session().
			suid(suid).
			data('cid', cid).
			data('item', creative._model());
		if (typeof data !== 'undefined' && data != null)
			rq.data('data', data);
		return rq.success(function (res) {
			var cr = adaptCreative(res['item']);
			cr.id(res['iid']);
			return cr;
		});
	};

	function adaptRules(rules) {
		var rv = [];
		for (var i = 0; i != rules.length; i++) {
			var conds = rules[i][self.ruleField.conditions];
			var res = [];
			for (var j = 0; j != conds.length; j++)
				res.push(new RuleCondition(conds[j]));
			var rule = new Rule(rules[i]);
			rules[i][self.ruleField.conditions] = res;
			rv.push(rule);
		}
		return rv;
	}

	/**
	 * listRules() - list campaign rules
	 * @cid:	target campaign id, `number`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.listRules = function (cid, suid) {
		return smapi.request().
			path('/campaign/list/rules').
			session().
			desc('list rules').
			suid(suid).
			data('cid', cid).
			success(function (res) {
				return adaptRules(res['rules']);
			});
	};

	/**
	 * createRule() - create new campaign rule
	 * @cid:	target campaign id, `number`
	 * @rule:	rule model, `Rule`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.createRule = function (cid, rule, suid) {
		return smapi.request().
			path('/campaign/create/rule').
			session().
			desc('create rule').
			suid(suid).
			data('cid', cid).
			data('rule', rule._model());
	};

	/**
	 * setRule() - update campaign rule
	 * @cid:	target campaign id, `number`
	 * @rule:	rule model, `Rule`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.setRule = function (cid, rule, suid) {
		return smapi.request().
			path('/campaign/set/rule').
			session().
			desc('update rule').
			suid(suid).
			data('cid', cid).
			data('rule', rule._model());
	};

	/**
	 * moveRule() - move campaign rule
	 * @cid:	target campaign id, `number`
	 * @fromIdx:	index of rule to move, `number`
	 * @toIdx:	index to move rule to, `number`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.moveRule = function (cid, fromIdx, toIdx, suid) {
		return smapi.request().
			path('/campaign/set/rule/move').
			session().
			desc('move rule').
			suid(suid).
			data('cid', cid).
			data('from', fromIdx).
			data('to', toIdx);
	};

	/**
	 * deleteRule() - delete campaign rule
	 * @cid:	target campaign id, `number`
	 * @rid:	target rule index, `number`
	 * @suid:	target user id, `number` (optional)
	 *
	 * Return: `smapi::Request`
	 */
	self.deleteRule = function (cid, rid, suid) {
		return smapi.request().
			path('/campaign/set/rule/delete').
			session().
			desc('delete rule').
			suid(suid).
			data('cid', cid).
			data('rid', rid);
	};

	/**
	 * PendingCampaign - Pending campaign model
	 */
	function PendingCampaign(model) {
		this._userId = model['uid'];
		this._campaignId = model['cid'];
		if (typeof model['links'] === 'object' &&
		    model['links'] != null) {
			var entries = model['links'];
			var links = [];
			for (var i = 0; i != entries.length; i++) {
				var en = entries[i];
				var link = new Link(en['item']);
				link.id(en['id']);
				links.push(link);
			}
			this._links = links;
		}
		if (typeof model['creatives'] === 'object' &&
		    model['creatives'] != null) {
			var entries = model['creatives'];
			var creatives = [];
			for (var i = 0; i != entries.length; i++) {
				var en = entries[i];
				var item = en['item'];
				var cr = adaptCreative(item);
				cr.id(en['id']);
				creatives.push(cr);
			}
			this._creatives = creatives;
		}
	}

	/**
	 * PendingCampaign::userId() - get or set user id of pending campaign
	 * @id:		user id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   user id of this pending campaign
	 */
	PendingCampaign.prototype.userId = function(id) {
		if (arguments.length)
			this._userId = id;
		else
			return this._userId;
	};

	/**
	 * PendingCampaign::campaignId() - get or set id of pending campaign
	 * @id:		id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   id of this pending campaign
	 */
	PendingCampaign.prototype.campaignId = function(id) {
		if (arguments.length)
			this._campaignId = id;
		else
			return this._campaignId;
	};

	/**
	 * PendingCampaign::links() - get or set pending links of pending campaign
	 * @links:	links, `Link[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   pending links of this pending campaign
	 */
	PendingCampaign.prototype.links = function(links) {
		if (arguments.length)
			this._links = links;
		else
			return this._links;
	};

	/**
	 * PendingCampaign::creatives() - get or set pending creatives of pending campaign
	 * @creatives:	creatives, `Creative[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the current
	 *	   pending creatives of this pending campaign
	 */
	PendingCampaign.prototype.creatives = function(creatives) {
		if (arguments.length)
			this._creatives = creatives;
		else
			return this._creatives;
	};

	/**
	 * pollPending() - poll next pending campaign
	 *
	 * Return: `smapi::Request`
	 */
	self.pollPending = function() {
		return smapi.request().
			path('/campaigns/poll_pending').
			session().
			desc('load pending campaign').
			success(function(data) {
				if (typeof data.uid === 'undefined')
					return null;
				return new PendingCampaign(data);
			});
	};

	/**
	 * rejectLink() - reject link pending approval
	 * @campaignId:	target link campaign id, `number`
	 * @linkId:	target link id, `number`
	 * @reason:	rejection reason, `string`
	 * @suid:	target user id, `number
	 *
	 * Return: `smapi::Request`
	 */
	self.rejectLink = function(campaignId, linkId, reason, suid) {
		return smapi.request().
			path('/campaign/reject/link').
			session().
			desc('reject campaign link').
			suid(suid).
			data('cid', campaignId).
			data('iid', linkId).
			data('reason', reason);
	};

	/**
	 * rejectCreative() - reject creative pending approval
	 * @campaignId:	target link campaign id, `number`
	 * @creativeId:	target creative id, `number`
	 * @reason:	rejection reason, `string`
	 * @suid:	target user id, `number
	 *
	 * Return: `smapi::Request`
	 */
	self.rejectCreative = function(campaignId, creativeId, reason, suid) {
		return smapi.request().
			path('/campaign/reject/creative').
			session().
			desc('reject campaign creative').
			suid(suid).
			data('cid', campaignId).
			data('iid', creativeId).
			data('reason', reason);
	};
});

/** Reporting API service. */
app.service('smreport', function (smapi, $filter) {
	var self = this;

	/** Report statistic field names */
	self.stat = {
		imps: {code: 'imps', text: 'Impressions'},
		ackCount: {code: 'ack_count', text: 'Clicks'},
		ackRate: {code: 'ack_rate', text: 'CTR'},
		ackCost: {code: 'ack_cost', text: 'CPC'},
		spend: {code: 'spend', text: 'Spend'},
		convCost: {code: 'conv_cost', text: 'CPA'},
		convCount: {code: 'conv_count', text: 'Actions'},
		convRate: {code: 'conv_rate', text: 'Action Rate'},
		milleCost: {code: 'mille_cost', text: 'CPM'},
		milleECost: {code: 'mille_ecost', text: 'eCPM'},
		roi: {code: 'roi', text: 'ROI'},
		revenue: {code: 'revenue', text: 'Revenue'},
		profit: {code: 'profit', text: 'Profit'},
		platformProfit: { code: 'platform_profit', text: 'Platform Profit' }
	};

	/**
	 * ReportStats - report statistics model
	 */
	function ReportStats(model) {
		this.model = model || {};
	}

	/**
	 * ReportStats::format - return a pretty print version of the
	 * stat value in mega format
	 */
	ReportStats.prototype.format = function (stat, value) {
		switch (stat) {
			case self.stat.ackRate.code:
			case self.stat.convRate.code:
			case self.stat.roi.code:
				return $filter('megaNumber')(value, 0) + '%';
			case self.stat.spend.code:
			case self.stat.revenue.code:
			case self.stat.profit.code:
			case self.stat.platformProfit:
			case self.stat.milleCost.code:
			case self.stat.milleECost.code:
				return '$' + $filter('megaNumber')(value, 2);
			default:
				return $filter('megaNumber')(value, 2);
		}
	};

	/**
	 * ReportStats::text() - return textual representation for stat
	 * given by code name e.g. ack_count returns 'Clicks'
	 *
	 * Return: String field name (stat.text) or original code if not found
	 */
	ReportStats.prototype.text = function (code) {
		for (var st of Object.keys(self.stat)) {
			var stat = self.stat[st];
			if (stat.code === code)
				return stat.text;
		}
		return code;
	};

	/**
	 * ReportStats::imps() - get or set impression count
	 * @n:	impression count, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the impression
	 *	   count.
	 */
	ReportStats.prototype.imps = function (n) {
		if (arguments.length)
			this.model[self.stat.imps.code] = n;
		else
			return this.model[self.stat.imps.code];
	};

	/**
	 * ReportStats::ackCount() - get or set impression acknowledgement count
	 * @n:	impression acknowledgement count, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the impression
	 *	   acknowledgement count.
	 */
	ReportStats.prototype.ackCount = function (n) {
		if (arguments.length)
			this.model[self.stat.ackCount.code] = n;
		else
			return this.model[self.stat.ackCount.code];
	};

	/**
	 * ReportStats::ackRate() - get or set impression acknowledgement rate
	 * @n:	impression acknowledgement rate, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the impression
	 *	   acknowledgement rate.
	 */
	ReportStats.prototype.ackRate = function (n) {
		if (arguments.length)
			this.model[self.stat.ackRate.code] = n;
		else
			return this.model[self.stat.ackRate.code];
	};

	/**
	 * ReportStats::ackCost() - get or set per-impression acknowledgement
	 *			    cost
	 * @n:	per-impression acknowledgement cost, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   per-impression acknowledgement cost.
	 */
	ReportStats.prototype.ackCost = function (n) {
		if (arguments.length)
			this.model[self.stat.ackCost.code] = n;
		else
			return this.model[self.stat.ackCost.code];
	};

	/**
	 * ReportStats::spend() - get or set total spend
	 * @n:	total spend, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the total spend
	 */
	ReportStats.prototype.spend = function (n) {
		if (arguments.length)
			this.model[self.stat.spend.code] = n;
		else
			return this.model[self.stat.spend.code];
	};

	/**
	 * ReportStats::convCost() - get or set per-conversion cost
	 * @n:	per-conversion cost, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   per-conversion cost
	 */
	ReportStats.prototype.convCost = function (n) {
		if (arguments.length)
			this.model[self.stat.convCost.code] = n;
		else
			return this.model[self.stat.convCost.code];
	};

	/**
	 * ReportStats::convCount() - get or set conversion count
	 * @n:	conversion count, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   conversion count
	 */
	ReportStats.prototype.convCount = function (n) {
		if (arguments.length)
			this.model[self.stat.convCount.code] = n;
		else
			return this.model[self.stat.convCount.code];
	};

	/**
	 * ReportStats::convRate() - get or set conversion rate
	 * @n:	conversion rate, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   conversion rate
	 */
	ReportStats.prototype.convRate = function (n) {
		if (arguments.length)
			this.model[self.stat.convRate.code] = n;
		else
			return this.model[self.stat.convRate.code];
	};

	/**
	 * ReportStats::milleCost() - get or set per-mille impression cost
	 * @n:	per-mille impression cost, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   per-mille impression cost
	 */
	ReportStats.prototype.milleCost = function (n) {
		if (arguments.length)
			this.model[self.stat.milleCost.code] = n;
		else
			return this.model[self.stat.milleCost.code];
	};

	/**
	 * ReportStats::milleECost() - get or set effective per-mille
	 *			       impression cost
	 * @n:	effective per-mille impression cost, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   effective per-mille impression cost
	 */
	ReportStats.prototype.milleECost = function (n) {
		if (arguments.length)
			this.model[self.stat.milleECost.code] = n;
		else
			return this.model[self.stat.milleECost.code];
	};

	/**
	 * ReportStats::roi() - get or set return-on-investment
	 * @n:	return-on-investment percentage, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   return-on-investment percentage
	 */
	ReportStats.prototype.roi = function (n) {
		if (arguments.length)
			this.model[self.stat.roi.code] = n;
		else
			return this.model[self.stat.roi.code];
	};

	/**
	 * ReportStats::revenue() - get or set total revenue
	 * @n:	total revenue, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   total revenue
	 */
	ReportStats.prototype.revenue = function (n) {
		if (arguments.length)
			this.model[self.stat.revenue.code] = n;
		else
			return this.model[self.stat.revenue.code];
	};

	/**
	 * ReportStats::profit() - get or set profit
	 * @n:	total profit, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   total profit
	 */
	ReportStats.prototype.profit = function (n) {
		if (arguments.length)
			this.model[self.stat.profit.code] = n;
		else
			return this.model[self.stat.profit.code];
	};

	/**
	 * ReportStats::platformProfit() - get or set platform profit
	 * @n:	total platform profit, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   total platform profit
	 */
	ReportStats.prototype.platformProfit = function (n) {
		if (arguments.length)
			this.model[self.stat.platformProfit.code] = n;
		else
			return this.model[self.stat.platformProfit.code];
	};

	/**
	 * ReportStats::field() - get or set statistic field
	 * @f:	field name
	 * @v:	field value, `any` (optional)
	 *
	 * Return: If only one argument (field name) is specified, this
	 *	   returns the field value
	 */
	ReportStats.prototype.field = function (f, v) {
		if (arguments.length === 2) {
			if (typeof v === 'object')
				v = v.code;
			this.model[f] = v;
		} else {
			return this.model[f];
		}
	};

	/**
	 * ReportStats::merge() - merge another report stat table with this
	 * @that:	table to merge, `ReportStat`
	 */
	ReportStats.prototype.merge = function (that) {
		for (var key in that.model) {
			if (!that.model.hasOwnProperty(key))
				continue;
			var cur = this.model[key];
			var val = that.model[key];
			if (typeof cur === 'undefined')
				cur = val;
			else
				cur = cur + val;
			this.model[key] = cur;
		}
	};

	/**
	 * ReportStats::fields() - return list of stat names present
	 */
	ReportStats.prototype.fields = function () {
		return Object.keys(this.model);
	};

	self.ReportStats = ReportStats;

	/** Report field names */
	self.field = {
		country: 'country',
		region: 'region',
		city: 'city',
		postalCode: 'postal_code',
		metroCode: 'metro_code',
		exchange: 'exchange',
		os: 'os',
		osv: 'osv',
		state: 'state',
		gender: 'gender',
		deviceType: 'devtype',
		connType: 'conntype',
		medType: 'medtype',
		timestamp: 'timestamp',
		totalBid: 'totalBid',
		value: 'value',
		creativeId: 'crid',
		linkId: 'lid',
		campaignId: 'cid',
		userId: 'uid',
		medId: 'medid',
		medName: 'medname',
		medDomain: 'meddomain',
		medPage: 'medpage',
		medBundle: 'medbundle',
		pubId: 'pubid',
		pubName: 'pubname',
		pubDomain: 'pubdomain',
		carrier: 'carrier',
		browser: 'browser',
		placementWidth: 'plcw',
		placementHeight: 'plch',
		devWidth: 'devw',
		devHeight: 'devh',
		mime: 'mime',
		devIds: 'devids',
		devMake: 'devmake',
		devModel: 'devmodel',
		age: 'age',
		ip: 'ip',
		sessDepth: 'sessdepth',
		freqDepth: 'freqdepth',
		iabCats: 'iab_cats'
	};

	/**
	 * Imp - impression model
	 */
	function Imp(model) {
		this.model = model || {};
	}

	/**
	 * Imp::postalCode() - get or set postal code
	 * @n:	postal code, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the postal code
	 */
	Imp.prototype.postalCode = function (n) {
		if (arguments.length)
			this.model[self.field.postalCode] = n;
		else
			return this.model[self.field.postalCode];
	};

	/**
	 * Imp::country() - get or set metro code
	 * @n:	metro code, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the metro
	 */
	Imp.prototype.metroCode = function (n) {
		if (arguments.length)
			this.model[self.field.metroCode] = n;
		else
			return this.model[self.field.metroCode];
	};

	/**
	 * Imp::country() - get or set alpha-3 country
	 * @n:	alpha-3 country code, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the alpha-3
	 *	   country code
	 */
	Imp.prototype.country = function (n) {
		if (arguments.length)
			this.model[self.field.country] = n;
		else
			return this.model[self.field.country];
	};

	/**
	 * Imp::exchange() - get or set exchange
	 * @n:	exchange, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the exchange
	 */
	Imp.prototype.exchange = function (n) {
		if (arguments.length)
			this.model[self.field.exchange] = n;
		else
			return this.model[self.field.exchange];
	};

	/**
	 * Imp::os() - get or set OS code
	 * @n:	OS code, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the OS code
	 */
	Imp.prototype.os = function (n) {
		if (arguments.length)
			this.model[self.field.os] = n;
		else
			return this.model[self.field.os];
	};

	/**
	 * Imp::osv() - get or set OS version
	 * @n:	OS version, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the OS version
	 */
	Imp.prototype.osv = function (n) {
		if (arguments.length)
			this.model[self.field.osv] = n;
		else
			return this.model[self.field.osv];
	};

	/**
	 * Imp::state() - get or set state
	 * @n:	state, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the state
	 */
	Imp.prototype.state = function (n) {
		if (arguments.length)
			this.model[self.field.state] = n;
		else
			return this.model[self.field.state];
	};

	/**
	 * Imp::gender() - get or set gender
	 * @n:	gender, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the gender
	 */
	Imp.prototype.gender = function (n) {
		if (arguments.length)
			this.model[self.field.gender] = n;
		else
			return this.model[self.field.gender];
	};

	/**
	 * Imp::deviceType() - get or set device type
	 * @n:	device type, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the device type
	 */
	Imp.prototype.deviceType = function (n) {
		if (arguments.length)
			this.model[self.field.deviceType] = n;
		else
			return this.model[self.field.deviceType];
	};

	/**
	 * Imp::connType() - get or set connection type
	 * @n:	connection type, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   connection type
	 */
	Imp.prototype.connType = function (n) {
		if (arguments.length)
			this.model[self.field.connType] = n;
		else
			return this.model[self.field.connType];
	};

	/**
	 * Imp::medType() - get or set medium type
	 * @n:	medium type, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the medium type
	 */
	Imp.prototype.medType = function (n) {
		if (arguments.length)
			this.model[self.field.medType] = n;
		else
			return this.model[self.field.medType];
	};

	/**
	 * Imp::timestamp() - get or set timestamp
	 * @n:	timestamp, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the Unix
	 *	   timestamp
	 */
	Imp.prototype.timestamp = function (n) {
		if (arguments.length)
			this.model[self.field.timestamp] = n;
		else
			return this.model[self.field.timestamp];
	};

	/**
	 * Imp::totalBid() - get or set bid value
	 * @n:	bid value, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the bid value
	 */
	Imp.prototype.totalBid = function (n) {
		if (arguments.length)
			this.model[self.field.totalBid] = n;
		else
			return this.model[self.field.totalBid];
	};

	/**
	 * Imp::value() - get or set value
	 * @n:	value, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   conversion value
	 */
	Imp.prototype.value = function (n) {
		if (arguments.length)
			this.model[self.field.value] = n;
		else
			return this.model[self.field.value];
	};

	/**
	 * Imp::creativeId() - get or set creative id
	 * @n:	creative id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   creative id
	 */
	Imp.prototype.creativeId = function (n) {
		if (arguments.length)
			this.model[self.field.creativeId] = n;
		else
			return this.model[self.field.creativeId];
	};

	/**
	 * Imp::linkId() - get or set link id
	 * @n:	link id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   link id
	 */
	Imp.prototype.linkId = function (n) {
		if (arguments.length)
			this.model[self.field.linkId] = n;
		else
			return this.model[self.field.linkId];
	};

	/**
	 * Imp::campaignId() - get or set campaign id
	 * @n:	campaign id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   campaign id
	 */
	Imp.prototype.campaignId = function (n) {
		if (arguments.length)
			this.model[self.field.campaignId] = n;
		else
			return this.model[self.field.campaignId];
	};

	/**
	 * Imp::userId() - get or set user id
	 * @n:	user id, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   user id
	 */
	Imp.prototype.userId = function (n) {
		if (arguments.length)
			this.model[self.field.userId] = n;
		else
			return this.model[self.field.userId];
	};

	/**
	 * Imp::medId() - get or set medium id
	 * @n:	medium id, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   medium id
	 */
	Imp.prototype.medId = function (n) {
		if (arguments.length)
			this.model[self.field.medId] = n;
		else
			return this.model[self.field.medId];
	};

	/**
	 * Imp::medName() - get or set medium name
	 * @n:	medium name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   medium name
	 */
	Imp.prototype.medName = function (n) {
		if (arguments.length)
			this.model[self.field.medName] = n;
		else
			return this.model[self.field.medName];
	};

	/**
	 * Imp::medDomain() - get or set medium domain
	 * @n:	medium domain, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   medium domain
	 */
	Imp.prototype.medDomain = function (n) {
		if (arguments.length)
			this.model[self.field.medDomain] = n;
		else
			return this.model[self.field.medDomain];
	};

	/**
	 * Imp::medPage() - get or set medium page
	 * @n:	medium page, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   medium page
	 */
	Imp.prototype.medPage = function(n) {
		if (arguments.length)
			this.model[self.field.medPage] = n;
		else
			return this.model[self.field.medPage];
	};

	/**
	 * Imp::medBundle() - get or set medium bundle
	 * @n:	medium bundle, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   medium bundle
	 */
	Imp.prototype.medBundle = function(n) {
		if (arguments.length)
			this.model[self.field.medBundle] = n;
		else
			return this.model[self.field.medBundle];
	};

	/**
	 * Imp::pubId() - get or set publisher id
	 * @n:	publisher id, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   publisher id
	 */
	Imp.prototype.pubId = function (n) {
		if (arguments.length)
			this.model[self.field.pubId] = n;
		else
			return this.model[self.field.pubId];
	};

	/**
	 * Imp::pubName() - get or set publisher name
	 * @n:	publisher name, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   publisher name
	 */
	Imp.prototype.pubName = function (n) {
		if (arguments.length)
			this.model[self.field.pubName] = n;
		else
			return this.model[self.field.pubName];
	};

	/**
	 * Imp::pubDomain() - get or set publisher domain
	 * @n:	publisher domain, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   publisher domain
	 */
	Imp.prototype.pubDomain = function (n) {
		if (arguments.length)
			this.model[self.field.pubDomain] = n;
		else
			return this.model[self.field.pubDomain];
	};

	/**
	 * Imp::carrier() - get or set carrier
	 * @n:	carrier, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the carrier
	 */
	Imp.prototype.carrier = function (n) {
		if (arguments.length)
			this.model[self.field.carrier] = n;
		else
			return this.model[self.field.carrier];
	};

	/**
	 * Imp::browser() - get or set browser
	 * @n:	browser, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the browser
	 */
	Imp.prototype.browser = function (n) {
		if (arguments.length)
			this.model[self.field.browser] = n;
		else
			return this.model[self.field.browser];
	};

	/**
	 * Imp::placementWidth() - get or set placement width
	 * @n:	placement width, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   placement width
	 */
	Imp.prototype.placementWidth = function (n) {
		if (arguments.length)
			this.model[self.field.placementWidth] = n;
		else
			return this.model[self.field.placementWidth];
	};

	/**
	 * Imp::placementHeight() - get or set placement height
	 * @n:	placement height, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   placement height
	 */
	Imp.prototype.placementHeight = function (n) {
		if (arguments.length)
			this.model[self.field.placementHeight] = n;
		else
			return this.model[self.field.placementHeight];
	};

	/**
	 * Imp::devWidth() - get or set device width
	 * @n:	device width, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   device width
	 */
	Imp.prototype.devWidth = function (n) {
		if (arguments.length)
			this.model[self.field.devWidth] = n;
		else
			return this.model[self.field.devWidth];
	};

	/**
	 * Imp::devHeight() - get or set device height
	 * @n:	device height, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   device height
	 */
	Imp.prototype.devHeight = function (n) {
		if (arguments.length)
			this.model[self.field.devHeight] = n;
		else
			return this.model[self.field.devHeight];
	};

	/**
	 * Imp::mime() - get or set mime
	 * @n:	mime, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the mime
	 */
	Imp.prototype.mime = function (n) {
		if (arguments.length)
			this.model[self.field.mime] = n;
		else
			return this.model[self.field.mime];
	};

	/**
	 * Imp::devMake() - get or set device make
	 * @n:	device make, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   device make
	 */
	Imp.prototype.devMake = function (n) {
		if (arguments.length)
			this.model[self.field.devMake] = n;
		else
			return this.model[self.field.devMake];
	};

	/**
	 * Imp::devModel() - get or set device model
	 * @n:	device model, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   device model
	 */
	Imp.prototype.devModel = function (n) {
		if (arguments.length)
			this.model[self.field.devModel] = n;
		else
			return this.model[self.field.devModel];
	};

	/**
	 * Imp::age() - get or set age
	 * @n:	age, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the age
	 */
	Imp.prototype.age = function (n) {
		if (arguments.length)
			this.model[self.field.age] = n;
		else
			return this.model[self.field.age];
	};

	/**
	 * Imp::ip() - get or set ip
	 * @n:	device ip, `string` (optional)
	 *
	 * Return: If no arguments are specified, this returns the device ip
	 */
	Imp.prototype.ip = function (n) {
		if (arguments.length)
			this.model[self.field.ip] = n;
		else
			return this.model[self.field.ip];
	};

	/**
	 * Imp::sessDepth() - get or set device session depth
	 * @n:	device session depth, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   device session depth
	 */
	Imp.prototype.sessDepth = function (n) {
		if (arguments.length)
			this.model[self.field.sessDepth] = n;
		else
			return this.model[self.field.sessDepth];
	};

	/**
	 * Imp::freqDepth() - get or set device frequency depth
	 * @n:	device frequency depth, `number` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   device frequency depth
	 */
	Imp.prototype.freqDepth = function (n) {
		if (arguments.length)
			this.model[self.field.freqDepth] = n;
		else
			return this.model[self.field.freqDepth];
	};

	/**
	 * Imp::iabCats() - get or set IAB categories
	 * @n:	IAB categories, `string[]` (optional)
	 *
	 * Return: If no arguments are specified, this returns the
	 *	   IAB categories array
	 */
	Imp.prototype.iabCats = function (n) {
		if (arguments.length)
			this.model[self.field.iabCats] = n;
		else
			return this.model[self.field.iabCats];
	};

	/**
	 * Imp::field() - get or set field
	 * @f:	field name
	 * @v:	field value, `any` (optional)
	 *
	 * Return: If only one argument is specified (field name), this returns
	 *	   the field value
	 */
	Imp.prototype.field = function (f, v) {
		if (arguments.length === 2)
			this.model[f] = v;
		else
			return this.model[f];
	};

	/**
	 * Imp::fields() - return list of field key values
	 *
	 * Return: Array of field names or empty array
	 */
	Imp.prototype.fields = function () {
		return Object.keys(this.model);
	}

	self.Imp = Imp;

	function Report(opts) {
		if (typeof opts === 'undefined' || opts === null)
			opts = {};
		this.model = new Imp(opts['model']);
		this.stats = new ReportStats(opts['stats']);
		this.hourOfDay = opts['hour_of_day'];
		this.dayOfWeek = opts['day_of_week'];
		this.dayOfMonth = opts['day_of_month'];
		this.monthOfYear = opts['month_of_year'];
		this.year = opts['year'];
	}
	;

	self.Report = Report;

	/**
	 * ReportImp - impression report request builder
	 */
	function ReportImp() {
		this._fields = null;
		this._stats = null;
		this._startTime = null;
		this._endTime = null;
		this._offset = null;
		this._limit = null;
		this._cid = null;
		this._resolution = null;
		this._filter = null;
	}

	/**
	 * ReportImp::cid() - set or get report campaign id
	 * @cid: optional, cid to set report for
	 *
	 * Return: cid if cid arg is null otherwise %this
	 */
	ReportImp.prototype.cid = function (cid) {
		if (typeof cid === 'number')
			this._cid = cid;
		else
			return this._cid;
		return this;
	};

	/**
	 * ReportImp::fields() - append fields to group reports by
	 * @names:	impression field names `string[]`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.fields = function (names) {
		if (this._fields == null)
			this._fields = [];
		for (var i = 0; i != names.length; i++)
			this._fields.push(names[i]);
		return this;
	};

	/**
	 * ReportImp::field() - append field to group reports by
	 * @name:	impression field name `string`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.field = function (name) {
		return this.fields([name]);
	};

	/**
	 * ReportImp::stats() - append statistics to report on
	 * @st:		statistics, either `stat[]` or `string[]`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.stats = function (st) {
		if (this._stats == null)
			this._stats = [];
		for (var i = 0; i != st.length; i++) {
			var s = st[i];
			if (typeof s === 'object') {
				if (typeof s.code === 'string')
					this._stats.push(s.code);
			} else if (typeof s === 'string') {
				this._stats.push(s);
			}
		}
		return this;
	};

	/**
	 * ReportImp::stat() - append statistic to report on
	 * @st:		statistic, either `stat` or `string`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.stat = function (st) {
		return this.stats([st]);
	};

	function timeToUnixMsec(time) {
		var timestamp;
		if (typeof time === 'string')
			timestamp = Date.parse(time).getTime();
		else if (typeof time === 'number')
			timestamp = time;
		else if (typeof time === 'object')
			timestamp = time.getTime();
		return timestamp;
	}

	/**
	 * ReportImp::startTime() - set report time beginning
	 * @time:	begin time, `Date`, time `string`, or
	 *		Unix timestamp (ms) `number`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.startTime = function (time) {
		this._startTime = timeToUnixMsec(time);
		return this;
	};

	/**
	 * ReportImp::endTime() - set report time end
	 * @time:	end time, `Date`, time `string`, or
	 *		Unix timestamp (ms) `number`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.endTime = function (time) {
		this._endTime = timeToUnixMsec(time);
		return this;
	};

	/**
	 * ReportImp::period() - set report time period based on common unit
	 * e.g. hour, day, month, year
	 * 
	 * Return: %this
	 */
	ReportImp.prototype.period = function (period) {
		return this.startTime(new moment().utc().startOf(period).valueOf()).
			endTime(new moment().utc().endOf(period).valueOf());
	};

	/**
	 * ReportImp::hourTime() - report on past hour
	 *
	 * Return: %this
	 */
	ReportImp.prototype.hourTime = function () {
		return this.period('hour');
	};

	/**
	 * ReportImp::dayTime() - report on today
	 *
	 * Return: %this
	 */
	ReportImp.prototype.dayTime = function () {
		return this.period('day');
	};

	/**
	 * ReportImp::monthTime() - report on past month
	 *
	 * Return: %this
	 */
	ReportImp.prototype.monthTime = function () {
		return this.period('month');
	};

	/**
	 * ReportImp::yearTime() - report on past year
	 *
	 * Return: %this
	 */
	ReportImp.prototype.yearTime = function () {
		return this.period('year');
	};

	/**
	 * ReportImp::offset() - set report entry offset
	 * @off:	entry offset
	 *
	 * Return: %this
	 */
	ReportImp.prototype.offset = function (off) {
		this._offset = off;
		return this;
	};

	/**
	 * ReportImp::limit() - set report entry limit
	 * @lim:	entry limit
	 *
	 * Return: %this
	 */
	ReportImp.prototype.limit = function (lim) {
		this._limit = lim;
		return this;
	};

	/**
	 * ReportImp::campaign() - set target campaign
	 * @id:		campaign id
	 *
	 * Return: %this
	 */
	ReportImp.prototype.campaign = function (id) {
		this._cid = id;
		return this;
	};

	ReportImp.prototype.resolution = function (r) {
		if (this._resolution == null)
			this._resolution = [];
		this._resolution.push(r);
		return this;
	};

	/**
	 * ReportImp::hourOfDay() - query report entry hour
	 *
	 * Return: %this
	 */
	ReportImp.prototype.hourOfDay = function () {
		return this.resolution('HOUR_OF_DAY');
	};

	/**
	 * ReportImp::dayOfWeek() - query report entry day (day-of-month)
	 *
	 * Return: %this
	 */
	ReportImp.prototype.dayOfWeek = function () {
		return this.resolution('DAY_OF_WEEK');
	};

	/**
	 * ReportImp::dayOfMonth() - query report entry day (day-of-month)
	 *
	 * Return: %this
	 */
	ReportImp.prototype.dayOfMonth = function () {
		return this.resolution('DAY_OF_MONTH');
	};

	/**
	 * ReportImp::monthOfYear() - query report entry month
	 *
	 * Return: %this
	 */
	ReportImp.prototype.monthOfYear = function () {
		return this.resolution('MONTH_OF_YEAR');
	};

	/**
	 * ReportImp::yearly() - query report entry year
	 *
	 * Return: %this
	 */
	ReportImp.prototype.year = function () {
		return this.resolution('YEAR');
	};

	/**
	 * ReportImp::filters() - append impression field filters
	 * @map:	filter map `map<string,any>`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.filters = function (map) {
		if (this._filter == null)
			this._filter = {};
		for (var key in map) {
			if (map.hasOwnProperty(key))
				this._filter[key] = map[key];
		}
		return this;
	};

	/**
	 * ReportImp::filter() - append impression field filter
	 * @k:		impression field name, `string`
	 * @v:		impression field value, `any`
	 *
	 * Return: %this
	 */
	ReportImp.prototype.filter = function (k, v) {
		var r = {};
		r[k] = v;
		return this.filters(r);
	};

	/**
	 * toRequest() - generate request from this impression report builder
	 *
	 * Return: `smapi::Request` instance
	 */
	ReportImp.prototype.toRequest = function () {
		var imps = false;
		if (this._stats != null) {
			for (var i = 0; i != this._stats.length; ) {
				if (this._stats[i] ===
					self.stat.imps.code) {
					imps = true;
					this._stats.splice(i, 1);
					i = 0;
				} else {
					i++;
				}
			}
		}

		var rq = smapi.request().
			path('/report/imp').
			desc('report').
			session();
		if (this._fields != null)
			rq.data('fields', this._fields);
		if (this._stats != null)
			rq.data('stats', this._stats);
		if (this._startTime != null)
			rq.data('start_time', this._startTime);
		if (this._endTime != null)
			rq.data('end_time', this._endTime);
		if (this._offset != null)
			rq.data('offset', this._offset);
		if (this._limit != null)
			rq.data('limit', this._limit);
		if (this._cid != null)
			rq.data('cid', this._cid);
		if (this._resolution != null)
			rq.data('resolution', this._resolution);
		if (this._filter != null) {
			var f = {};
			var any = false;
			for (var key in this._filter) {
				if (this._filter.hasOwnProperty(key)) {
					f[key] = this._filter[key];
					any = true;
				}
			}
			if (any)
				rq.data('filter', f);
		}

		var r = this;
		return rq.success(function (res) {
			var entries = res['entries'];
			var rv = [];
			for (var i = 0; i != entries.length; i++) {
				var report = new Report(entries[i]);
				if (imps) {
					var num = entries[i]['count'];
					report.stats.imps(num);
				}

				if (r._resolution) {
					var date = new moment().utc().startOf('day');

					if (report.hourOfDay > -1)
						date.hour(report.hourOfDay);
					if (report.dayOfWeek > -1 && report.dayOfMonth == -1)
						date.day(report.dayOfWeek - 1);
					if (report.dayOfMonth > -1)
						date.date(report.dayOfMonth);
					if (report.monthOfYear > -1)
						date.month(report.monthOfYear - 1);
					if (report.year > -1)
						date.year(report.year);

					report.model.field('timestamp',
						date.local().valueOf());
				}

				rv.push(report);
			}
			if (r._resolution) {
				rv.sort(function(x, y) {
					return x.model.field('timestamp') -
					       y.model.field('timestamp');
				});
			}
			return rv;
		});
	};

	/**
	 * reportImp() - construct and return a new impression report object
	 *
	 * Return: `ReportImp` instance
	 */
	self.reportImp = function () {
		return new ReportImp();
	};

	/**
	 * reportValues() - report values
	 *
	 * Return: `smapi::Request`
	 */
	self.reportValues = function (field, filter) {
		var rq = smapi.request().
			path('/report/imp/values').
			desc('list values').
			session().
			data('field', field);
		if (typeof filter !== 'undefined')
			rq.data('filter', filter);
		return rq.success(function (res) {
			return res['values']
		});
	};
});

app.service('smchart', function (smreport) {

	var statSeries = {};
	statSeries[smreport.stat.imps.code] = {color: '#f39c12'};
	statSeries[smreport.stat.ackCount.code] = {color: '#0b9bff'};
	statSeries[smreport.stat.ackRate.code] = {color: '#80caff'};
	statSeries[smreport.stat.spend.code] = {color: '#dd5d42'};
	statSeries[smreport.stat.revenue.code] = {color: '#83c983'};
	statSeries[smreport.stat.profit.code] = {color: '#5cb85c'};
	statSeries[smreport.stat.convRate.code] = {color: '#dd99ff'};
	statSeries[smreport.stat.convCount.code] = {color: '#b31aff'};

	this.graph = function (div, reports) {
		if (!reports || !reports.length)
			return;

		var fields = reports[0].model.fields();

		var time = (fields.indexOf('timestamp') > -1);

		var chart = {
			title: null,
			chart: {type: time ? 'line' : 'column', height: 300}, /* line if report by field is time based.. */
			xAxis: {type: time ? 'datetime' : 'category'},
			yAxis: [{title: null}, {title: null, opposite: true}],
			tooltip: {shared: true},
			series: []
		};

		for (var stat of reports[0].stats.fields()) {
			chart.series.push({
				name: reports[0].stats.text(stat),
				color: statSeries[stat] ? statSeries[stat].color : null,
				data: []});
		}

		for (var r of reports) {
			var ls = [];
			for (var label of fields) {
				ls.push(r.model.field(label));
			}
			if (!time) {
				if (!chart.xAxis.categories)
					chart.xAxis.categories = [];
				chart.xAxis.categories.push(ls.reverse().join(', '));
			}

			for (var x in r.stats.fields()) {
				if (time)
					chart.series[x].data.push([r.model.field('timestamp'), r.stats.field(r.stats.fields()[x])]);
				else
					chart.series[x].data.push(r.stats.field(r.stats.fields()[x]));
			}

		}

		$('#' + div).highcharts(chart);
	};

	this.scatter = function (div, reports) {
		var xField = reports[0].stats.fields()[0];
		var xText = reports[0].stats.text(xField);
		var yField = reports[0].stats.fields()[1];
		var yText = reports[0].stats.text(yField);

		var chart = {
			title: null,
			chart: {type: 'scatter'},
			tooltip: {enabled: false},
			title: null,
			xAxis: {
				title: {
					enabled: true,
					text: xText
				}
			},
			yAxis: {
				title: {
					enabled: true,
					text: yText
				}
			},
			plotOptions: {
				scatter: {
					marker: {radius: 3}
				}
			},
			series: [{data: []}]
		};

		for (var report of reports)
			chart.series[0].data.push([report.stats.field(xField), report.stats.field(yField)]);
		$('#' + div).highcharts(chart);
	};

	this.destroy = function (div) {
		var el = $('#' + div).highcharts();
		if (el)
			$('#' + div).highcharts().destroy();
	};

});

app.controller('nav', function ($rootScope, $scope, $timeout,
				$location, $routeParams,
				_smsess, smsess, smuser) {

	var balUpdatePromise = null;
	var userId = null;
	$scope.suserId = null;
	$scope.usrBal = null;

	function canUpdateBalance() {
		if ($scope.suserId == null)
			return true;
		return smsess.hasPermission(smuser.permission.allUserPayment);
	}

	function updateUserId() {
		var euid;
		if (typeof $routeParams.userId === 'string' &&
		    ($routeParams.userId = $routeParams.userId.trim()).length > 0) {
			euid = Number.parseInt($routeParams.userId);
			if (euid != _smsess.userId())
				$scope.suserId = euid;
		} else {
			euid = _smsess.userId();
			$scope.suserId = null;
		}
		if (euid == userId)
			return null;
		if (balUpdatePromise != null) {
			$timeout.cancel(balUpdatePromise);
			balUpdatePromise = null;
		}
		userId = euid;
		return euid;
	}

	function updateBalance(euid, user) {
		if (!canUpdateBalance())
			return;
		smuser.get([smuser.field.creditLimit],
			   [smuser.balanceField.amount], euid).
			success(function(ub) {
				user.creditLimit(ub.user().creditLimit());
				ub.user(user);
				$scope.usrBal = ub;
				scheduleBalanceUpdate();
			}).background().send();
	}

	function scheduleBalanceUpdate() {
		balUpdatePromise = $timeout(function() {
			var uid = userId;
			var ub = $scope.usrBal;
			balUpdatePromise = null;
			if (uid == null)
				return;
			if (ub == null || ub.user() == null ||
			    ub.user().id() != userId)
				updateUserBalance(userId);
			else
				updateBalance(uid, ub.user());
		}, 5000);
	}

	function updateUserBalance(euid) {
		var balFields = [];
		var usrFields = [smuser.field.details];
		if (canUpdateBalance()) {
			balFields.push(smuser.balanceField.amount);
			usrFields.push(smuser.field.creditLimit);
		}
		smuser.get(usrFields, balFields, euid).
			success(function(ub) {
				$scope.usrBal = ub;
				scheduleBalanceUpdate();
			}).background().send();
	}

	if (typeof $routeParams.userId === 'string' &&
	    ($routeParams.userId = $routeParams.userId.trim()).length > 0) {
		userId = Number.parseInt($routeParams.userId);
		if (userId != _smsess.userId())
			$scope.suserId = userId;
		if (euid != null)
			updateUserBalance(euid);
	} else if (smsess.user() != null) {
		$scope.suserId = null;
		userId = smsess.user().id();
		updateBalance(smsess.user().id(), smsess.user());
	}

	$rootScope.$on('smsess.user', function(event, user) {
		if (user == null) {
			/* Session invalidated. */
			$scope.usrBal = null;
			$scope.userId = null;
			return;
		}
		var euid = updateUserId();
		if (euid != null) {
			if (euid == user.id())
				updateBalance(euid, user);
			else
				updateUserBalance(euid);
		}
	});

	$rootScope.$on('$routeChangeSuccess', function() {
		var euid = updateUserId();
		if (euid != null) {
			if (smsess.user() != null &&
			    euid == smsess.user().id())
				updateBalance(euid, smsess.user());
			else
				updateUserBalance(euid);
		}
	});

	$scope.isActive = function ($page) {
		/* /campaigns/whatever - nav is 2nd level path */
		var $thisPage = $location.path().substr(1).split('/')[0];
		return $thisPage.indexOf($page) === 0 ||
			(!$thisPage && $page == 'home');
	};

	$scope.getCrumbs = function () {
		var $path = $location.path().substr(1).split('/');
		var $base = $path[0];
		var $plen = $path.length;

		var $html = '';
		while ($plen-- > 0) {
			var $href = $path.join('/');
			var $name = $path.pop();
			$html = [
				'<li>',
				'<a href="#', $href, '">',
				$name,
				'</a>',
				'</li>',
				$html
			].join('');
		}

		if ($base != 'home') {
			$html = [
				'<li>',
				'<a href="#home">Home</a>',
				'</li>',
				$html
			].join('');
		}
		return $html;
	};

	$scope.isAdmin = function() {
		return smsess.hasPermission(
			smuser.permission.allCampaign,
			smuser.permission.allApproval,
			smuser.permission.allUser,
			smuser.permission.allUserInvoice,
			smuser.permission.allUserPayment);
	};
});

/** Campaign listing (child) controller. */
app.controller('campaignListingController', function ($scope, smapi,
						      smcampaign, smreport) {
	$scope.smcampaign = smcampaign;
	$scope.smreport = smreport;

	$scope.campaigns = $scope.$parent.campaigns;

	$scope.sort = {
		field: null, /* entry field name */
		object: null, /* entry object name */
		asc: false	/* ascending/descending */
	};

	/* Compares two campaigns (returns inverse if descending) */
	function sortCmp(x, y) {
		var xf = x[$scope.sort.object].field($scope.sort.field);
		var yf = y[$scope.sort.object].field($scope.sort.field);
		if (typeof xf !== typeof yf)
			return -1;
		var rv = 0;
		if (typeof xf === 'string') {
			rv = xf.localeCompare(yf);
		} else if (typeof xf === 'number') {
			if (xf > yf)
				rv = 1;
			else if (xf < yf)
				rv = -1;
			else
				rv = 0;
		} else {
			rv = -1;
		}
		return $scope.sort.asc ? rv : -rv;
	}

	function doSort() {
		/*
		 * If display campaigns is equal to parent campaign listing
		 * then simply sort on the parent campaign list
		 */
		$scope.$parent.campaigns.sort(sortCmp);
		if ($scope.campaigns !== $scope.$parent.campaigns)
			$scope.campaigns.sort(sortCmp);
	}

	/**
	 * sortBy() - sort campaigns by field name
	 * @obj:	object name
	 * @name:	field name
	 */
	$scope.sortBy = function (obj, field) {
		if ($scope.sort.object === obj &&
			$scope.sort.field === field) {
			$scope.sort.asc = !$scope.sort.asc;
		} else {
			$scope.sort.object = obj;
			$scope.sort.field = field;
			$scope.sort.asc = true;
		}
		doSort();
	};
	$scope.sortBy('campaign', 'name');

	/** Campaign name to filter by. */
	$scope.campaignName = '';

	/**
	 * search() - perform search for campaign
	 *
	 * This searches for campaigns with names starting with %searchName.
	 */
	$scope.search = function () {
		var name = $scope.campaignName.trim().toUpperCase();
		if (name.length === 0) {
			$scope.campaigns = $scope.$parent.campaigns;
			return;
		}
		var pc = $scope.$parent.campaigns;
		var res = [];
		for (var i = 0; i != pc.length; i++) {
			var c = pc[i];
			var cn = c.campaign.name().toUpperCase();
			if (name.length > cn.length)
				continue;
			var p = true;
			for (var j = 0; j != name.length; j++) {
				if (name.charAt(j) != cn.charAt(j)) {
					p = false;
					break;
				}
			}
			if (p)
				res.push(c);
		}
		if (res.length == pc.length)
			res = pc;
		$scope.campaigns = res;
	};

	function setState(c, st) {
		smcampaign.setState(c.id(), st, $scope.$parent.userId).
			success(function (res) {
				c.state(st);
			}).error(function(err) {
				var desc = smapi.describeError(err);
				if (desc === 'validate fields' &&
				    st === smcampaign.state.active)
					desc = 'un-approved link or creative';
				alerts.error('Failed to toggle campaign: ' + desc);
			}).send();
	}

	$scope.archive = function (c) {
		setState(c, smcampaign.state.archived);
	};

	$scope.toggleState = function (c) {
		var st = c.state();
		if (st === smcampaign.state.active ||
		    st === smcampaign.state.dailyBudget ||
		    st === smcampaign.state.totalBudget ||
		    st === smcampaign.state.accountBudget)
			st = smcampaign.state.paused;
		else if (st === smcampaign.state.paused)
			st = smcampaign.state.active;
		else
			return;
		setState(c, st);
	};

	$scope.$parent.$watchCollection('campaigns', function (cur, old) {
		if ($scope.campaignName.length !== 0)
			$scope.search();
		else
			$scope.campaigns = cur;
		doSort();
	});
});

/** /home controller */
app.controller('homeController', function ($scope, $routeParams, smsess,
					   smuser, smcampaign, smreport,
					   smchart) {
	$scope.userId = $routeParams.userId;
	if (typeof $scope.userId === 'string' &&
	    $scope.userId.trim().length === 0)
		$scope.userId = null;
	$scope.loading = true;

	/** Statistics to display in table. */
	$scope.displayStats = [
		smreport.stat.imps,
		smreport.stat.ackCount,
		smreport.stat.convCount,
		smreport.stat.spend,
		smreport.stat.revenue,
		smreport.stat.roi
	];

	/** Statistics to display in heading. */
	$scope.headStats = [
		smreport.stat.imps,
		smreport.stat.ackCount,
		smreport.stat.convCount,
		smreport.stat.spend,
		smreport.stat.profit
	];

	/** Statistics to display in graph. */
	$scope.graphStats = [
		smreport.stat.imps,
		smreport.stat.ackCount,
		smreport.stat.spend,
		smreport.stat.revenue
	];

	if (smsess.hasPermission(smuser.permission.allUserPayment)) {
		$scope.graphStats.push(smreport.stat.platformProfit);
		$scope.headStats.push(smreport.stat.platformProfit);
	} else {
		$scope.headStats.push(smreport.stat.roi);
	}

	/** List of all campaigns. */
	$scope.campaigns = [];

	/** Account global statistics (daily). */
	$scope.stats = new smreport.ReportStats();

	for (var i = 0; i != $scope.headStats.length; i++)
		$scope.stats[$scope.headStats[i].code] = 0;

	function updateCampaign(en, set) {
		smreport.reportImp().
			stats($scope.displayStats).
			campaign(en.campaign.id()).
			period($scope.timePeriod).
			toRequest().
			suid($scope.userId).
			success(function (stats) {
				if (!stats || !stats.length)
					en.stats = new smreport.ReportStats();
				else
					en.stats = stats[0].stats;
				if (en.stats.imps()) {
					if (!set)
						$scope.campaigns.push(en);
					return;
				}
				if (!set)
					return;
				for (var i = 0; i != $scope.campaigns.length; i++) {
					var cc = $scope.campaigns[i];
					if (cc.campaign.id() === en.campaign.id()) {
						$scope.campaigns.splice(i, 1);
						break;
					}
				}
			}).send();
	}
	;

	function appendCampaigns(entries) {
		for (var i = 0; i != entries.length; i++) {
			var en = entries[i];
			var set = false;
			for (var j = 0; j != $scope.campaigns.length; j++) {
				var cc = $scope.campaigns[j];
				if (cc.campaign.id() === en.campaign.id()) {
					$scope.campaigns[j] = en;
					set = true;
					break;
				}
			}
			updateCampaign(en, set);
		}
	}

	var fields = [
		smcampaign.field.name,
		smcampaign.field.state
	];
	var states = [
		smcampaign.state.active,
		smcampaign.state.dailyBudget,
		smcampaign.state.totalBudget,
		smcampaign.state.accountBudget
	];

	$scope.load = function () {
		$scope.campaigns = [];

		$scope.timePeriod = $scope.timePeriod ? $scope.timePeriod : 'day';
		switch ($scope.timePeriod) {
			case 'day':
				$scope.timeRes = 'HOUR_OF_DAY';
				break;
			case 'week':
				$scope.timeRes = 'DAY_OF_WEEK';
				break;
			case 'month':
				$scope.timeRes = 'DAY_OF_MONTH';
				break;
			case 'year':
				$scope.timeRes = 'MONTH_OF_YEAR';
				break;
			default:
				console.warn("Unexpected timeperiod " + $scope.timePeriod);
		}

		var numLoaded = 0;
		for (var i = 0; i != states.length; i++) {
			smcampaign.list(fields, null, states[i],
					$scope.userId).
				success(appendCampaigns).
				success(function (data) {
					if (!data)
						return;

					if (++numLoaded == states.length)
						$scope.loading = false;
				}).send();
		}

		/* for graph */
		smreport.reportImp().
			stats($scope.graphStats).
			period($scope.timePeriod).
			resolution($scope.timeRes).
			cid(-1).
			toRequest().
                        suid($scope.userId).
			success(function (stats) {
				if (stats && stats.length)
					smchart.graph('home-chart', stats);
				else
					smchart.destroy('home-chart');
			}).send();

		/* for box stats */
		smreport.reportImp().
			stats($scope.headStats).
			period($scope.timePeriod).
			cid(-1).
			toRequest().
                        suid($scope.userId).
			success(function (stats) {
				if (stats && stats.length)
					$scope.stats = stats[0].stats;
				else
					$scope.stats = new smreport.ReportStats();
			}).send();
	};

	$scope.load();

});

/** /campaign controller */
app.controller('campaignController', function ($scope, $routeParams, $http,
					       alerts, smcampaign, smreport) {
	$scope.smcampaign = smcampaign;

	/** Campaign model. */
	$scope.campaign = new smcampaign.Campaign();
	/** Campaign links. */
	$scope.links = [];
	/** Link we're adding. */
	$scope.link = new smcampaign.Link();

	$http.get('inc/js/resources/iab_cats.js').then(function (r) {
		$scope.iabCats = r.data;
	});

	if (typeof $routeParams.userId === 'string' &&
	    ($routeParams.userId = $routeParams.userId.trim()).length > 0)
		$scope.userId = Number.parseInt($routeParams.userId);
	else
		$scope.userId = null;

	if (typeof $routeParams.id === 'string' &&
	    ($routeParams.id = $routeParams.id.trim()).length > 0) {
		var id = Number.parseInt($routeParams.id);
		if (id == -1) {
			$scope.create = true;
		} else {
			$scope.create = false;
			$scope.campaign.id(id);
		}
	} else {
		$scope.create = true;
	}

	$scope.addLink = function () {
		var link = $scope.link;
		if ($scope.create) {
			$scope.link = new smcampaign.Link();
			$scope.links.push(link);
			return;
		}
		smcampaign.createLink($scope.campaign.id(), link,
			$scope.userId).success(function (res) {
			$scope.link = new smcampaign.Link();
			$scope.links.push(res);
		}).send();
	};

	function doDeleteLink(link) {
		var i = $scope.links.indexOf(link);
		if (i !== -1)
			$scope.links.splice(i, 1);
	}

	$scope.confirmDeleteLink = function () {
		var link = $scope.targetLink;
		$scope.targetLink = null;
		smcampaign.setLinkState($scope.campaign.id(), link.id(),
			smcampaign.itemState.archived,
			$scope.userId).success(function (r) {
			doDeleteLink(link);
		}).send();
	};

	$scope.deleteLink = function (link) {
		if ($scope.create) {
			doDeleteLink(link);
		} else {
			// go through confirmation process
			$scope.targetLink = link;
		}
	};

	$scope.setLinkState = function (link, state) {
		if ($scope.create) {
			link.state(state);
			return;
		}
		smcampaign.setLinkState($scope.campaign.id(), link.id(), state,
			$scope.userId).success(function (res) {
			link.state(state);
		}).send();
	};

	$scope.doImportUserIds = function() {
	};

	function create() {
		smcampaign.create($scope.campaign.model, $scope.userId).
			success(function (res) {
				var links = $scope.links;
				for (var i = 0; i != links.length; i++) {
					var link = links[i];
					smcampaign.createLink(res.id(), link,
						$scope.userId).
						send();
				}
				$scope.campaign = res;
				$scope.create = false;
			}).send();
	}

	$scope.save = function () {
		if ($scope.create) {
			create();
			return;
		}
		smcampaign.set($scope.campaign, $scope.userId).
			success(function (res) {
				$scope.campaign = res;
			}).send();
	};

	$scope.changeTab = function (tab) {
		$('.nav-pills > li.active').removeClass('active');
		$(tab).parent().addClass('active');
	};

	/* Impression heatmap */
	function drawHeatMap(reports) {
		this.draw = function () {
			var rows = [['Country', 'Impressions']];
			for (var i = 0; i != reports.length; i++) {
				var report = reports[i];
				var code = report.model.country();
				if (typeof code !== 'string')
					continue;
				if (code.length === 3) {
					code = $scope.countries[code];
					if (typeof code === 'undefined')
						continue;
				} else if (code.length !== 2) {
					continue;
				}
				rows.push([code, report.stats.imps() * 100]);
			}

			var chart = new google.visualization.GeoChart(
				document.getElementById('map'));
			chart.draw(google.visualization.arrayToDataTable(rows),
				{colors: ['#FFFFFF', '#5cb85c']});
		};

		google.charts.setOnLoadCallback(this.draw);
		window.onresize = this.draw;
	}

	$scope.countries = [];
	$http.get('inc/js/resources/country_alpha3.js').then(function (r) {
		$scope.countries = r.data;
		smreport.reportImp().
			field(smreport.field.country).
			stat(smreport.stat.imps).
			toRequest().
			success(drawHeatMap).send();
	});

	smreport.reportValues(smreport.field.exchange).
		success(function (exchanges) {
			exchanges.sort(function(x, y) {
				if (x < y)
					return -1;
				if (x > y)
					return 1;
				return 0;
			});
			$scope.exchanges = exchanges;
		}).send();

	if (!$scope.create) {
		smcampaign.get($scope.campaign.id(), [
			smcampaign.field.name,
			smcampaign.field.defaultBid,
			smcampaign.field.placementBudget,
			smcampaign.field.dailyBudget,
			smcampaign.field.totalBudget,
			smcampaign.field.countries,
			smcampaign.field.exchanges,
			smcampaign.field.os,
			smcampaign.field.frequencyCap,
			smcampaign.field.frequencyDays,
			smcampaign.field.iabCats,
			smcampaign.field.spendPacing
		], null, $scope.userId).success(function (res) {
			$scope.campaign = res.campaign;
		}).send();

		smcampaign.listLinks($scope.campaign.id(), [
			smcampaign.linkField.name,
			smcampaign.linkField.state,
			smcampaign.linkField.value,
			smcampaign.linkField.url,
			smcampaign.linkField.adomain
		], null, $scope.userId).success(function (res) {
			$scope.links = res;
		}).send();
	}
});

/** /campaign controller (targeting) */
app.controller('campaignTargetingController',
	function ($scope, $location, alerts, smcampaign, smreport) {

		$scope.location = $location.path();

		/* Condition op symbols */
		$scope.condOpSyms = {};
		$scope.condOpSyms[smcampaign.ruleConditionType.eq] = 'equal to';
		$scope.condOpSyms[smcampaign.ruleConditionType.ne] = 'not equal to';
		$scope.condOpSyms[smcampaign.ruleConditionType.li] = 'like';
		$scope.condOpSyms[smcampaign.ruleConditionType.nl] = 'unlike';
		$scope.condOpSyms[smcampaign.ruleConditionType.gt] = 'greater than';
		$scope.condOpSyms[smcampaign.ruleConditionType.lt] = 'less than';

		/* BCL ops for id fields */
		var idOps = [
			smcampaign.ruleConditionType.eq,
			smcampaign.ruleConditionType.ne
		];

		/* BCL ops for string fields */
		var strOps = [
			smcampaign.ruleConditionType.eq,
			smcampaign.ruleConditionType.ne,
			smcampaign.ruleConditionType.li,
			smcampaign.ruleConditionType.nl
		];

		/* BCL ops for numeric fields */
		var numOps = [
			smcampaign.ruleConditionType.eq,
			smcampaign.ruleConditionType.ne,
			smcampaign.ruleConditionType.gt,
			smcampaign.ruleConditionType.lt
		];

		$scope.fields = {
			country: {
				code: smreport.field.country,
				text: 'Country',
				ops: idOps
			},
			region: {
				code: smreport.field.region,
				text: 'Region',
				ops: idOps
			},
			city: {
				code: smreport.field.city,
				text: 'City',
				ops: idOps
			},
			postalCode: {
				code: smreport.field.postalCode,
				text: 'Postal Code',
				ops: idOps
			},
			metroCode: {
				code: smreport.field.metroCode,
				text: 'Metro Code',
				ops: idOps
			},
			carrier: {
				code: smreport.field.carrier,
				text: 'Carrier',
				ops: strOps
			},
			sessDepth: {
				code: smreport.field.sessDepth,
				text: 'Session Depth',
				ops: numOps
			},
			freqDepth: {
				code: smreport.field.freqDepth,
				text: 'Frequency Depth',
				ops: numOps
			},
			age: {
				code: smreport.field.age,
				text: 'Age',
				ops: numOps
			},
			iabCats: {
				code: smreport.field.iabCats,
				text: 'Category',
				ops: strOps
			},
			hourOfDay: {
				code: 'hod',
				text: 'Hour Of Day',
				ops: numOps
			},
			dayOfWeek: {
				code: 'dow',
				text: 'Day Of Week',
				ops: idOps
			},
			exchange: {
				code: smreport.field.exchange,
				text: 'Exchange',
				ops: idOps
			},
			osv: {
				code: smreport.field.osv,
				text: 'OS Version',
				ops: numOps
			},
			gender: {
				code: smreport.field.gender,
				text: 'User Gender',
				ops: idOps
			},
			browser: {
				code: smreport.field.browser,
				text: 'Browser',
				ops: strOps
			},
			deviceMake: {
				code: smreport.field.devMake,
				text: 'Device Make',
				ops: idOps
			},
			deviceModel: {
				code: smreport.field.devModel,
				text: 'Device Model',
				ops: idOps
			},
			deviceType: {
				code: smreport.field.deviceType,
				text: 'Device Type',
				ops: idOps
			},
			connType: {
				code: smreport.field.connType,
				text: 'Device Connection',
				ops: idOps
			},
			medType: {
				code: smreport.field.medType,
				text: 'Medium Type',
				ops: idOps
			},
			medId: {
				code: smreport.field.medId,
				text: 'Medium ID',
				ops: idOps
			},
			medName: {
				code: smreport.field.medName,
				text: 'Medium Name',
				ops: strOps
			},
			medDomain: {
				code: smreport.field.medDomain,
				text: 'Medium Domain',
				ops: strOps
			},
			medPage: {
				code: smreport.field.medPage,
				text: 'Medium Page',
				ops: strOps
			},
			medBundle: {
				code: smreport.field.medBundle,
				text: 'Mobile App Bundle',
				ops: strOps
			},
			pubId: {
				code: smreport.field.pubId,
				text: 'Publisher ID',
				ops: idOps
			},
			pubName: {
				code: smreport.field.pubName,
				text: 'Publisher Name',
				ops: strOps
			},
			pubDomain: {
				code: smreport.field.pubDomain,
				text: 'Publisher Domain',
				ops: strOps
			}
		};

		/** Existing rules. */
		$scope.rules = [];

		/* New rule definitions. */
		$scope.rule = new smcampaign.Rule();
		$scope.cond = new smcampaign.RuleCondition();
		$scope.fieldValues = [];

		$scope.fieldText = function (code) {
			for (var key in $scope.fields) {
				if (!$scope.fields.hasOwnProperty(key))
					continue;
				if ($scope.fields[key].code === code)
					return $scope.fields[key].text;
			}
		};

		var HOURS_OF_DAY = [
			"00:00", "01:00", "02:00", "03:00",
			"04:00", "05:00", "06:00", "07:00",
			"08:00", "09:00", "10:00", "11:00",
			"12:00", "13:00", "14:00", "15:00",
			"16:00", "17:00", "18:00", "19:00",
			"20:00", "21:00", "22:00", "23:00"
		];

		var DAYS_OF_WEEK = [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
			"Sunday"
		];

		$scope.onCondFieldChange = function () {
			var code = $scope.fields[$scope.cond.field()].code;
			if (code === $scope.fields.hourOfDay.code) {
				$scope.fieldValues = HOURS_OF_DAY;
				return;
			}
			if (code === $scope.fields.dayOfWeek.code) {
				$scope.fieldValues = DAYS_OF_WEEK;
				return;
			}

			var filt = {};
			filt[smreport.field.country] = $scope.$parent.campaign.countries();
			smreport.reportValues(code, filt).success(function (d) {

				$scope.fieldValues = d;
				
				// Added for custom Publisher Domain value of 'Unknown';
				if (code === $scope.fields.pubDomain.code || code === $scope.fields.pubName.code || code === $scope.fields.medDomain.code || code === $scope.fields.medName.code || code === $scope.fields.medBundle.code) {
					$scope.fieldValues.push('null');
					$scope.fieldValues.push('unknown');
					$scope.fieldValues.push('Unknown');
				}

			}).background().send();
		};

		$scope.addCondition = function () {
			var cond = $scope.cond;
			if (typeof cond.field() !== 'string' ||
				cond.field().length === 0) {
				alerts.error('Condition field not specified.');
				return;
			}
			if (typeof cond.type() !== 'string' ||
				cond.type().length === 0) {
				alerts.error('Condition type not specified.');
				return;
			}
			if (typeof cond.value() === 'undefined' ||
				cond.value() == null ||
				(typeof cond.value() === 'string' &&
					cond.value().length === 0)) {
				alerts.error('Condition value not specified.');
				return;
			}

			var conds = $scope.rule.conditions();
			if (typeof conds === 'undefined' || conds == null) {
				conds = [];
				$scope.rule.conditions(conds);
			}

			var c = new smcampaign.RuleCondition($scope.cond._model());
			c.field($scope.fields[cond.field()].code);
			$scope.cond.value(null);
			conds.push(c);
		};

		$scope.clearRule = function () {
			$scope.rule = new smcampaign.Rule();
			$scope.cond = new smcampaign.RuleCondition();
		};

		$scope.addRule = function () {
			var rule = $scope.rule;
			if (typeof rule.name() !== 'string' ||
				rule.name().length === 0) {
				alerts.error('Rule name not specified.');
				return;
			}
			if (typeof rule.conditions() === 'undefined' ||
				!rule.conditions().length) {
				alerts.error('Rule has no conditions.');
				return;
			}
			for (var i = 0; i != rule.conditions().length; i++) {
				var cond = rule.conditions()[i];
				var code = cond.field();
				if (code === $scope.fields.hourOfDay.code) {
					var idx = HOURS_OF_DAY.indexOf(cond.value());
					if (idx === -1) {
						alerts.error('Invalid hour of day');
						return;
					}
					cond.value(idx);
				} else if (code === $scope.fields.dayOfWeek.code) {
					var idx = DAYS_OF_WEEK.indexOf(cond.value());
					if (idx === -1) {
						alerts.error('Invalid day of week');
						return;
					}
					cond.value(idx + 1);
				}
			}
			$scope.rule = new smcampaign.Rule();
			smcampaign.createRule($scope.$parent.campaign.id(), rule,
				$scope.$parent.userId).
				success(function (res) {
					$scope.rules.push(rule);
				}).send();
		};

		$scope.editRule = function (rule) {
			/* xxx: need to keep track that this is an existing rule we are editing,
			 so save does not duplicate it. we also need to keep existing rule index */
			$scope.rule = rule;
		};

		function doDeleteRule(idx) {
			$scope.rules.splice(idx, 1);
		}

		$scope.deleteRule = function (rule) {
			var idx;
			for (var i = 0; i != $scope.rules; i++) {
				if ($scope.rules[i] === rule) {
					idx = i;
					break;
				}
			}
			if (typeof idx === 'undefined')
				return;
			if ($scope.$parent.create) {
				doDeleteRule(idx);
				return;
			}
			smcampaign.deleteRule($scope.$parent.campaign.id(), idx,
				$scope.$parent.userId).
				success(function (res) {
					doDeleteRule(idx);
				}).send();
		};

		$scope.deleteCond = function (c) {
			$scope.rule.model.conditions.splice(c, 1);
		};

		function doMoveRule(fromIdx, toIdx) {
			if (fromIdx === toIdx)
				return;
			var rmIdx;
			if (fromIdx > toIdx) {
				rmIdx = fromIdx + 1;
			} else {
				rmIdx = fromIdx;
			}
			if (rmIdx == (toIdx - 1)) {
				var from = $scope.rules[fromIdx];
				var to = $scope.rules[toIdx];
				$scope.rules[toIdx] = from;
				$scope.rules[fromIdx] = to;
			} else {
				var from = $scope.rules[fromIdx];
				if (toIdx === ($scope.rules.length - 1))
					$scope.rules.push(from);
				else
					$scope.rules.splice(toIdx, 0, from);
				$scope.rules.splice(rmIdx, 1);
			}
		}

		function moveRule(fromIdx, toIdx) {
			if ($scope.$parent.create) {
				doMoveRule(fromIdx, toIdx);
			} else {
				smcampaign.moveRule($scope.$parent.campaign.id(),
					fromIdx, toIdx,
					$scope.$parent.userId).
					success(function (res) {
						doMoveRule(fromIdx, toIdx);
					}).background().send();
			}
		}

		$scope.sortable = {
			'container': '#sbi_container',
			'orderChanged': function (ev) {
				moveRule(ev.source.index, ev.dest.index);
			}
		};

		if ($scope.$parent.create)
			return;

		smcampaign.listRules($scope.$parent.campaign.id(),
			$scope.$parent.userId).
			success(function (r) {
				$scope.rules = r;
			}).background().send();
	});

app.directive('creativeName', function (smcampaign) {
	return {
		restrict: 'AE',
		replace: 'true',
		templateUrl: 'inc/templates/campaigns/directives/' +
			'creative_name.html'
	};
});

app.directive('convertToNumber', function() {
	return {
		require: 'ngModel',
		link: function(scope, element, attrs, ngModel) {
			ngModel.$parsers.push(function(v) {
				if (typeof v === 'number')
					return v;
				return v != null ? parseInt(v, 10) : null;
			});
			ngModel.$formatters.push(function(v) {
				return v != null ? '' + v : null;
			});
		}
	};
});

/** /campaign controller (creatives) */
app.controller('campaignCreativesController',
	function ($scope, $http, alerts, smsess, smcampaign, smapi, API_HOST) {

		$scope.smcampaign = smcampaign;

		$http.get('inc/js/resources/creative_attrs.js').then(function (r) {
			$scope.creativeAttrs = r.data;
		});

		function CreativeContext() {
			this._creative = new smcampaign.Creative();
			this._type = 'text';
		}

		CreativeContext.prototype.previewUrl = function (c) {
			if (arguments.length === 0)
				return this._previewUrl;
			if (c.indexOf('http://') === -1 &&
			    c.indexOf('https://') === -1)
				c = 'http://' + c;
			this._previewUrl = c;
		};

		CreativeContext.prototype.content = function (c) {
			if (arguments.length === 0)
				return this._content;
			this._content = c;
		};

		CreativeContext.prototype.creative = function (c) {
			if (arguments.length === 0)
				return this._creative;
			this._creative = c;
		};

		CreativeContext.prototype.api = function (c) {
			if (arguments.length === 0)
				return this._api;
			this._api = c;
		};

		CreativeContext.prototype.mraid2 = function (c) {
			if (arguments.length === 0)
				return this.api() == 'MRAID2';
			this.api(c ? 'MRAID2' : null);
		};

		CreativeContext.prototype.type = function (t) {
			if (arguments.length === 0)
				return this._type;
			switch (this._type) {
				case 'image':
					this._creative.image(null);
					break;
				case 'text':
					this._creative.text(null);
					break;
				case 'html':
					this._creative.html(null);
					break;
			}
			this._type = t;
		};

		CreativeContext.prototype.htmlOrText = function () {
			var next = this._type == 'text' ? 'html' : 'text';
			this.type(next);
		};

		CreativeContext.prototype.width = function (t) {
			if (arguments.length === 0)
				return this._width;
			this._width = t;
		};

		CreativeContext.prototype.height = function (t) {
			if (arguments.length === 0)
				return this._height;
			this._height = t;
		};

		CreativeContext.prototype.secureHtml = function (t) {
			if (arguments.length === 0)
				return this._secureHtml;
			this._secureHtml = t;
		};

		$scope.creativeContext = new CreativeContext();

		$scope.textCreatives = [];
		$scope.htmlCreatives = [];
		$scope.htmlCreativeData = [];
		$scope.imageCreatives = [];

		$scope.resolveCreativeSrc = function (id) {
			var uid = $scope.$parent.userId;
			if (typeof uid !== 'number' || uid == null)
				uid = smsess.user().id();
			return API_HOST + '/campaign/get/creative/data/' +
				uid + '/' + $scope.$parent.campaign.id() + '/' + id;
		};

		function doAddCreative(cr) {
			if (cr.mime() === 'text/plain') {
				$scope.textCreatives.push(cr);
			} else if (cr.mime() == 'text/html') {
				$scope.htmlCreatives.push(cr);
			} else {
				$scope.imageCreatives.push(cr);
			}
		}

		function ImageUpload(files) {
			this.count = 0;
			this.files = files;
			this.state = null;
			this.source = null;
			this.name = null;
		}

		ImageUpload.prototype.cancel = function () {
			$scope.imageUploadDone(this);
		};

		ImageUpload.prototype.skipUpload = function () {
			if (this.count == this.files.length) {
				$scope.imageUploadDone(this);
			} else {
				switch (this.state) {
					case 'upload-all':
						this.uploadAll();
						break;
					case 'rename-all':
						this.renameAll();
						break;
				}
			}
		};

		ImageUpload.prototype.doUpload = function (callback) {
			var creative = new smcampaign.Creative();
			creative.name(this.name);
			creative.image(new smcampaign.Image());

			var self = this;
			return smcampaign.createCreative(
				$scope.$parent.campaign.id(), creative,
				this.source, $scope.$parent.userId).
				success(function (cr) {
					doAddCreative(cr);
					if (self.count === self.files.length) {
						$scope.imageUploadDone(self);
						return;
					}
					switch (self.parentState) {
						case 'renaming':
							self.renameAll();
							break;
						case 'uploading':
							self.uploadAll();
					}
				}).error(function (r) {
				var msg;
				if (r.errno !== 'EEXIST') {
					msg = smapi.describeError(r);
				} else {
					msg = 'Creative with name already ' +
						'exists, please rename.';
					self.count = self.count - 1;
					self.state = 'loading';
					self.readNext(function (self) {
						self.state = 'renaming';
					});
				}
				alerts.error(msg);
			}).send();
		};

		ImageUpload.prototype.readNext = function (callback) {
			var file = this.files[this.count++];
			this.name = file.name;

			var self = this;
			var reader = new FileReader();
			reader.addEventListener('load', function () {
				self.source = reader.result;
				callback(self);
			});
			reader.readAsDataURL(file);
		};

		ImageUpload.prototype.uploadAll = function () {
			this.parentState = 'uploading';
			this.readNext(function (self) {
				self.doUpload();
			});
		};

		ImageUpload.prototype.renameAll = function () {
			this.parentState = 'renaming';
			this.state = 'loading';
			this.readNext(function (self) {
				self.state = 'renaming';
			});
		};

		$scope.imageUploadDone = function (up) {
			$scope.imageUpload = null;
			$('#upload-image-modal').modal('hide');
		};

		$scope.onImageSelect = function ($files) {
			if ($files.length === 0)
				return;
			$scope.imageUpload = new ImageUpload($files);
			$scope.$files = null;
			$('#upload-image-modal').modal('show');
		};

		$scope.addCreative = function () {
			var ctx = $scope.creativeContext;

			var name = ctx.creative().name();
			if (typeof name !== 'string' ||
				(name = name.trim()).length === 0) {
				alerts.error('Creative name not specified.');
				return;
			}
			switch (ctx.type()) {
				case 'html':
					var purl = ctx.previewUrl();
					if (typeof purl !== 'string' ||
						(purl = purl.trim()).length === 0) {
						alerts.error('Creative preview URL not set.');
						return;
					}
					if (!ctx.width() || !ctx.height()) {
						alerts.error('Creative dimensions not set.');
						return;
					}
				case 'text':
					var content = ctx.content();
					if (typeof content !== 'string' ||
						(content = content.trim()).length === 0) {
						alerts.error('Creative content not set.');
						return;
					}
					break;
				default:
					alerts.error('Creative type not selected.');
			}

			var creative = ctx.creative();
			var data = null;
			switch (ctx.type()) {
				case 'html':
					var html = new smcampaign.Html();
					html.previewUrl(ctx.previewUrl());
					html.width(ctx.width());
					html.height(ctx.height());
					if (typeof ctx.secureHtml() == 'boolean' &&
						ctx.secureHtml())
						html.secure(true);
					if (typeof ctx.api() == 'string')
						html.api(ctx.api());
					creative.html(html);
					creative.mime('text/html');
					data = ctx.content();
					break;
				case 'text':
					var text = new smcampaign.Text();
					text.text(ctx.content());
					creative.text(text);
					creative.mime('text/plain');
					break;
			}
			smcampaign.createCreative($scope.$parent.campaign.id(),
				creative, data,
				$scope.$parent.userId).
				success(function (cr) {
					doAddCreative(creative);
					if (data != null)
						$scope.htmlCreativeData.push(data);
					$scope.creativeContext = new CreativeContext();
				}).error(function (r) {
				var msg;
				if (r.errno !== 'EEXIST') {
					msg = smapi.describeError(r);
				} else {
					msg = 'Creative with name already ' +
						'exists, please rename.';
				}
				alerts.error(msg);
			}).send();
		};

		function setState(cr, st) {
			smcampaign.setCreativeState($scope.$parent.campaign.id(),
				cr.id(), st, $scope.$parent.userId).
				success(function (res) {
					cr.state(st);
				}).send();
		}

		$scope.archive = function (cr) {
			setState(cr, smcampaign.itemState.archived);
		};

		$scope.toggleState = function (cr) {
			var st = cr.state();
			if (st === smcampaign.itemState.active)
				st = smcampaign.itemState.paused;
			else if (st === smcampaign.itemState.paused)
				st = smcampaign.itemState.active;
			else
				return;
			setState(cr, st);
		};

		if ($scope.$parent.create)
			return;

		function onHtmlDataErr(iid, rs) {
			alerts.error('Failed to load HTML creative data for ' +
				iid + ': ' + smapi.describeError(rs));
		}

		function loadHtmlData0(iid, i) {
			$http.get($scope.resolveCreativeSrc(iid)).
				then(function (rs) {
					if (rs.status !== 200) {
						onHtmlDataErr(iid, rs);
						return;
					}
					$scope.htmlCreativeData[i] = rs.data;
				}, function (rs) {
					onHtmlDataErr(iid, rs);
				});
		}

		function loadHtmlData() {
			for (var i = 0; i != $scope.htmlCreatives.length; i++) {
				var iid = $scope.htmlCreatives[i].id();
				loadHtmlData0(iid, i);
			}
		}

		smcampaign.listCreatives($scope.$parent.campaign.id(),
			[
				smcampaign.creativeField.name,
				smcampaign.creativeField.state,
				smcampaign.creativeField.mime,
				smcampaign.creativeField.text,
				smcampaign.creativeField.html,
				smcampaign.creativeField.image
			], $scope.$parent.userId).
			success(function (crs) {
				var hidx = 0;
				for (var i = 0; i != crs.length; i++) {
					var cr = crs[i];
					doAddCreative(cr);
				}
				loadHtmlData();
			}).background().send();
	});

/** /campaigns controller */
app.controller('campaignsController', function ($scope, $routeParams,
						smcampaign, smreport) {
	$scope.userId = $routeParams.userId;
	if (typeof $scope.userId === 'string' &&
	    $scope.userId.trim().length === 0) {
		$scope.userId = null;
	} else {
		$scope.userId = Number.parseInt($scope.userId);
		if (isNaN($scope.userId))
			$scope.userId = null;
	}

	$scope.loading = true;

	$scope.campaigns = [];
	$scope.displayStats = [
		smreport.stat.imps,
		smreport.stat.ackCount,
		smreport.stat.convCount,
		smreport.stat.spend,
		smreport.stat.revenue,
		smreport.stat.roi
	];

	function add(en) {
		smreport.reportImp().stats($scope.displayStats).
			campaign(en.campaign.id()).toRequest().
			suid($scope.userId).
			success(function (report) {
				if (report && report.length != 0)
					en.stats = report[0].stats;
				else
					en.stats = new smreport.ReportStats();
				$scope.campaigns.push(en);
				$scope.loading = false;
			}).send();
	}

	smcampaign.list([smcampaign.field.name, smcampaign.field.state],
		null, null, $scope.userId).
		success(function (data) {
			if (data.length == 0) {
				$scope.loading = false;
				return;
			}
			$scope.loading = true;
			for (var i = 0; i != data.length; i++)
				add(data[i]);
		}).send();
});

app.controller('reportController',
	function ($scope, $routeParams, $http, $timeout, alerts, smcampaign,
		  smreport, smchart, Pagination) {

		var HOURS_OF_DAY = [
			"00:00", "01:00", "02:00", "03:00",
			"04:00", "05:00", "06:00", "07:00",
			"08:00", "09:00", "10:00", "11:00",
			"12:00", "13:00", "14:00", "15:00",
			"16:00", "17:00", "18:00", "19:00",
			"20:00", "21:00", "22:00", "23:00"
		];

		var DAYS_OF_WEEK = [
			"Monday",
			"Tuesday",
			"Wednesday",
			"Thursday",
			"Friday",
			"Saturday",
			"Sunday"
		];

		var MONTHS_OF_YEAR = [
			"January",
			"February",
			"March",
			"April",
			"May",
			"June",
			"July",
			"August",
			"September",
			"October",
			"November",
			"December"
		];

		var campaignStats = [
			smreport.stat.imps,
			smreport.stat.ackCount,
			smreport.stat.ackRate,
			smreport.stat.ackCost,
			smreport.stat.spend,
			smreport.stat.convCost,
			smreport.stat.convRate,
			smreport.stat.convCount,
			smreport.stat.milleECost,
			smreport.stat.milleCost,
			smreport.stat.roi,
			smreport.stat.revenue,
			smreport.stat.profit
		];

		$scope.trendStats = [
			smreport.stat.ackRate,
			smreport.stat.ackCost,
			smreport.stat.convCost,
			smreport.stat.convRate,
			smreport.stat.convCount,
			smreport.stat.milleECost,
			smreport.stat.milleCost,
			smreport.stat.roi
		];

		$scope.fields = {};
		$scope.fields[smreport.field.country] = 'Country';
		$scope.fields[smreport.field.region] = 'Region';
		$scope.fields[smreport.field.city] = 'City';
		$scope.fields[smreport.field.postalCode] = 'Postal Code';
		$scope.fields[smreport.field.metroCode] = 'Metro Code';
		$scope.fields[smreport.field.exchange] = 'Exchange';
		$scope.fields[smreport.field.gender] = 'User Gender';
		$scope.fields[smreport.field.os] = 'Device OS';
		$scope.fields[smreport.field.osv] = 'Device OS Version';
		$scope.fields[smreport.field.deviceType] = 'Device Type';
		$scope.fields[smreport.field.connType] = 'Device Connection';
		$scope.fields[smreport.field.devMake] = 'Device Make';
		$scope.fields[smreport.field.devModel] = 'Device Model';
		$scope.fields[smreport.field.medType] = 'Medium Type';
		$scope.fields[smreport.field.medId] = 'Medium ID';
		$scope.fields[smreport.field.medName] = 'Medium Name';
		$scope.fields[smreport.field.medDomain] = 'Medium Domain';
		$scope.fields[smreport.field.pubId] = 'Publisher ID';
		$scope.fields[smreport.field.pubName] = 'Publisher Name';
		$scope.fields[smreport.field.pubDomain] = 'Publisher Domain';
		$scope.fields[smreport.field.carrier] = 'Carrier';
		$scope.fields[smreport.field.browser] = 'Browser';
		$scope.fields['_pseudo_plcdims'] = 'Placement Dimensions';
		$scope.fields[smreport.field.age] = 'User Age';
		$scope.fields[smreport.field.mime] = 'MIME';
		$scope.fields[smreport.field.iabCats] = 'IAB Categories';

		var campaignFields = {};
		campaignFields[smreport.field.creativeId]
			= 'Creative ID';
		campaignFields[smreport.field.linkId] = 'Link ID';
		campaignFields['_pseudo_creative_name'] = 'Creative Name';
		campaignFields['_pseudo_link_name'] = 'Link Name';
		campaignFields['_pseudo_link_url'] = 'Link URL';
		campaignFields[smreport.field.devWidth] = 'Device Width';
		campaignFields[smreport.field.devHeight] = 'Device Height';
		campaignFields[smreport.field.sessDepth] = 'Session Depth';
		campaignFields[smreport.field.freqDepth] = 'Frequency Depth';
		campaignFields[smreport.field.medPage] = 'Medium Page';
		campaignFields[smreport.field.medBundle] = 'Mobile App Bundle';

		campaignFields['_pseudo_hod'] = 'Hour of Day';
		campaignFields['_pseudo_dow'] = 'Day of Week';
		campaignFields['_pseudo_dom'] = 'Day of Month';
		campaignFields['_pseudo_moy'] = 'Month of Year';

		function addCampaignFields() {
			for (var k in campaignFields) {
				if (!campaignFields.hasOwnProperty(k))
					continue;
				$scope.fields[k] = campaignFields[k];
			}
			$scope.stats = [].concat($scope.stats, campaignStats);
		}

		$scope.countries = [];
		$scope.exchanges = [];
		$http.get('inc/js/resources/country_alpha3.js').then(function (r) {
			$scope.countries = r.data;
		});
		$http.get('inc/js/resources/exchanges.js').then(function (r) {
			$scope.exchanges = r.data;
		});

		$scope.reportFields = [];
		$scope.reportStats = [];
		$scope.filter = {
			startDate: $('#stats-date-start').datetimepicker({
				'format': 'MM/DD/YYYY',
				'showClose': true,
				'maxDate': new Date()
			}),
			endDate: $('#stats-date-end').datetimepicker({
				'format': 'MM/DD/YYYY',
				'showClose': true,
				'maxDate': moment().endOf('day').toDate()
			})
		};

		$scope.sort = function (type, f) {
			$scope.sortType = type;
			$scope.sortKey = f;
			$scope.reverse = !$scope.reverse;
		};

		$scope.sortBy = function (r) {
			return r[$scope.sortType].field($scope.sortKey);
		};

		$scope.$watch('results', function (val) {
			if ($scope.doGraph)
				smchart.graph('chartdiv', val);
			else
				smchart.destroy('chartdiv');
		});

		$scope.setDatePeriod = function (days) {
			var x = $('#stats-date-start').data('DateTimePicker');
			var y = $('#stats-date-end').data('DateTimePicker');
			y.date(moment().endOf('day'));
			x.date(moment().startOf('day').subtract(days, 'days'));
		};

		$scope.addFilter = function (imp) {
			if (!$scope.reportingFilter)
				$scope.reportingFilter = {};

			for (var field of imp.fields()) {
				var vals = $scope.reportingFilter[field];
				var fval = imp.field(field);
				if (field.startsWith('_pseudo_'))
					continue;
				if (field === 'timestamp')
					continue;

				if (vals && vals.indexOf(fval) === -1)
					$scope.reportingFilter[field].push(fval);
				else
					$scope.reportingFilter[field] = [fval];

				var ridx = $scope.reportingFields.indexOf(field);
				if (ridx > -1)
					$scope.reportingFields.splice(ridx, 1);
			}
		};

		/**
		 Returns true if this imp row already matches a filter entry
		 */
		$scope.isFiltered = function (imp) {
			var f = $scope.reportingFilter;
			if (!f)
				return false;

			for (var x in $scope.reportFields) {
				var field = $scope.reportFields[x];
				var val = f[field];

				if (val == null || val.indexOf(imp.field(field)) == -1)
					return false;
			}

			return true;
		};

		$scope.rmFilterVal = function (field, index) {
			var vals = $scope.reportingFilter[field];
			vals.splice(index, 1);
			if (!vals.length)
				delete $scope.reportingFilter[field];
		}

		function setDates(rq) {
			var x = $('#stats-date-start').data('DateTimePicker').date();
			var y = $('#stats-date-end').data('DateTimePicker').date();
			if (x !== null)
				rq.startTime(x.utc().valueOf());
			if (y !== null)
				rq.endTime(y.utc().valueOf());

			if ($scope.reportFields.indexOf('_pseudo_hod') > -1)
				rq.hourOfDay();
			if ($scope.reportFields.indexOf('_pseudo_dow') > -1)
				rq.dayOfWeek();
			if ($scope.reportFields.indexOf('_pseudo_dom') > -1)
				rq.dayOfMonth();
			if ($scope.reportFields.indexOf('_pseudo_moy') > -1)
				rq.monthOfYear();

			rq.campaign($scope.cid);
		}
		;

		function populateCreativeName(rep) {
			smcampaign.getCreative($scope.cid,
				rep.model.field(smreport.field.creativeId),
				[smcampaign.creativeField.name],
				$scope.userId).
				success(function (cr) {
					rep.model.field('_pseudo_creative_name', cr.name());
				}).background().send();
		}

		function populateCreativeNames(reps) {
			for (var i = 0; i != reps.length; i++)
				populateCreativeName(reps[i]);
		}

		function populateLinkField(rep) {
			smcampaign.getLink($scope.cid, rep.model.field(smreport.field.linkId),
					   [smcampaign.linkField.name,
					    smcampaign.linkField.url],
					   $scope.userId).
				success(function (ln) {
					rep.model.field('_pseudo_link_name', ln.name());
					rep.model.field('_pseudo_link_url', ln.url());
				}).background().send();
		}

		function populateLinkFields(reps) {
			for (var i = 0; i != reps.length; i++)
				populateLinkField(reps[i]);
		}

		function populatePlacementDims(reps) {
			for (var i = 0; i != reps.length; i++) {
				var rep = reps[i];
				rep.model.field('_pseudo_plcdims',
					rep.model.field(smreport.field.placementWidth) + 'x' +
					rep.model.field(smreport.field.placementHeight));
			}
		}

		function populateHoursOfDay(reps) {
			for (var i = 0; i != reps.length; i++) {
				var rep = reps[i];
				var hr = HOURS_OF_DAY[rep.hourOfDay];
				if (typeof hr === 'undefined')
					hr = rep.hourOfDay;
				rep.model.field('_pseudo_hod', hr);
			}
		}

		function populateDaysOfWeek(reps) {
			for (var i = 0; i != reps.length; i++) {
				var rep = reps[i];
				var day = DAYS_OF_WEEK[rep.dayOfWeek - 1];
				if (typeof day === 'undefined')
					day = rep.dayOfWeek;
				rep.model.field('_pseudo_dow', day);
			}
		}

		function populateDaysOfMonth(reps) {
			for (var i = 0; i != reps.length; i++) {
				var rep = reps[i];
				rep.model.field('_pseudo_dom', rep.dayOfMonth);
			}
		}

		function populateMonthsOfYear(reps) {
			for (var i = 0; i != reps.length; i++) {
				var rep = reps[i];
				var mon = MONTHS_OF_YEAR[rep.monthOfYear - 1];
				if (typeof mon === 'undefined')
					mon = rep.monthOfYear;
				rep.model.field('_pseudo_moy', mon);
			}
		}

		$scope.doExportUserIds = function() {
			alerts.error('Campaign has no data');
		};

		$scope.reports = [];
		$scope.doReport = function () {
			$scope.pagination = Pagination.getNew(15);

			$scope.reports = {};
			$scope.reportFilter = $scope.reportingFilter ?
				$.extend({}, $scope.reportingFilter) : {};
			$scope.reportStats = $scope.reportingStats.slice();
			$scope.reportFields = Object.keys($scope.reportFilter ? $scope.reportFilter
				: {}).concat($scope.reportingFields)

			var rq = smreport.reportImp().
				stats($scope.reportStats);

			for (var f in $scope.reportFilter)
				rq.filter(f, $scope.reportFilter[f]);

			for (var i = 0; i != $scope.reportFields.length; i++) {
				var field = $scope.reportFields[i];
				if (field == '_pseudo_creative_name') {
					rq.field(smreport.field.creativeId);
				} else if (field == '_pseudo_link_name' ||
					field == '_pseudo_link_url') {
					rq.field(smreport.field.linkId);
				} else if (field == '_pseudo_plcdims') {
					rq.field(smreport.field.placementWidth);
					rq.field(smreport.field.placementHeight);
				} else {
					rq.field(field);
				}
			}

			if ($scope.cid)
				setDates(rq);

			rq.toRequest().suid($scope.userId).success(function (s) {
				for (var i = 0; i != $scope.reportFields.length; i++) {
					var field = $scope.reportFields[i];
					if (field == '_pseudo_creative_name') {
						populateCreativeNames(s);
					} else if (field == '_pseudo_link_name' ||
						field == '_pseudo_link_url') {
						populateLinkFields(s);
					} else if (field == '_pseudo_plcdims') {
						populatePlacementDims(s);
					} else if (field == '_pseudo_hod') {
						populateHoursOfDay(s);
					} else if (field == '_pseudo_dow') {
						populateDaysOfWeek(s);
					} else if (field == '_pseudo_dom') {
						populateDaysOfMonth(s);
					} else if (field == '_pseudo_moy') {
						populateMonthsOfYear(s);
					}
				}

				$scope.reports = s;
				$scope.sortType = 'stats';
				if (!s || !s.length)
					return;

				$scope.sortKey = $scope.reportStats[0].code;
				$scope.reverse = true;
				$scope.pagination.numPages = Math.ceil(s.length / $scope.pagination.perPage);
			}).send();
		};

		if (typeof $routeParams.id === 'string' &&
			($routeParams.id = $routeParams.id.trim()).length > 0) {
			$scope.reportingStats = [
				smreport.stat.imps,
				smreport.stat.milleCost,
				smreport.stat.spend
			];

			var id = $scope.cid = Number.parseInt($routeParams.id);
			var uid = $routeParams.userId;
			if (typeof uid === 'string' &&
				(uid = uid.trim()).length > 0) {
				uid = Number.parseInt(uid);
			} else {
				uid = null;
			}
			$scope.loading = true;
			smcampaign.get(id, [smcampaign.field.name, smcampaign.field.defaultBid],
				null, uid).
				success(function (res) {
					$scope.setDatePeriod(0); /* default to today */

					$scope.campaign = res.campaign;
					$scope.userId = uid;
					$scope.loading = false;
					$scope.defaultBid = res.campaign.defaultBid();
					addCampaignFields();

					smcampaign.listRules($scope.cid, $scope.userId).
						success(function (r) {
							$scope.rules = r;
						}).background().send();
				}).send();
		} else {
			$scope.loading = false;
			$scope.campaign = null;

			$scope.reportingFields = [smreport.field.country];

			$scope.reportingStats = [
				smreport.stat.imps,
				smreport.stat.milleCost
			];
		}

		$scope.testRules = function (report) {
			var r = {};
			for (var field of report.model.fields())
				r[field] = report.model.field(field);
			for (var rule of $scope.rules) {
				if (rule.test(rule, r))
					return rule;
			}

			return false;
		};

		$scope.beginAddRule = function (report, rule) {
			$scope.tmpReport = report;
			$scope.tmpRule = rule;
			$('#add-rule-modal').modal('show');
		};

		$scope.bidTooltip = function (idx, report, bid) {
			if (!report) {
				$('.tip-bid-info-' + idx).tooltip('hide');
				return;
			}

			if ($scope.lastTipReport && $scope.lastTipReport == report) {
				$('.tip-bid-info-' + idx).tooltip('show');
				return;
			}

			$scope.lastTipReport = report;
			$scope.tip = {bid: bid};

			var rq = smreport.reportImp().
				stats([smreport.stat.milleCost, smreport.stat.imps]).
				fields($scope.reportFields);

			for (var f in $scope.reportFilter)
				rq.filter(f, $scope.reportFilter[f]);
			for (var f of report.model.fields())
				rq.filter(f, report.model.field(f));
			rq.toRequest().success(function (report) {
				var rep = report[0];
				$scope.tip.volume = rep.stats.imps();
				$scope.tip.price = rep.stats.milleCost();

				$timeout(function () {
					$('.tip-bid-info-' + idx).tooltip({
						html: true,
						title: $('#bidinfo-tooltip').html(),
						trigger: 'manual'
					});

					$('.tip-bid-info-' + idx).tooltip('show');
				});
			}).send();
		};

		$scope.doTrendReport = function () {
			var rq = smreport.reportImp().
				stats([$scope.reportingStatX, $scope.reportingStatY]).
				fields([smreport.field.pubId]);

			setDates(rq);

			rq.toRequest().suid($scope.userId).success(function (report) {
				$scope.doTrend = true;
				smchart.scatter('trenddiv', report);
			}).send();
		};

	});

/** /login/forgot controller */
app.controller('loginForgotController', function($scope, alerts, smuser) {
	$scope.state = 0;
	$scope.email = null;

	$scope.resetKey = function() {
		var email = $scope.email;
		if (email == null) {
			alerts.error('Please specify your e-mail address');
			return;
		}
		$scope.state = 1;
		smuser.resetPassword(email).success(function() {
			$scope.state = 2;
		}).error(function() {
			$scope.state = 0;
		}).send();
        };
});

/** /login/forgot/reset controller */
app.controller('loginResetController', function($scope, $routeParams, $location,
						alerts, smuser) {
	$scope.email = $routeParams.email;
	$scope.key = $routeParams.key;
	$scope.pw1 = null;
	$scope.pw2 = null;
	$scope.state = 0;

	$scope.resetPassword = function() {
		if ($scope.email == null || $scope.email.length == 0) {
			alerts.error('Please specify your e-mail address');
			return;
		}
		if ($scope.key == null || $scope.key.length == 0) {
			alerts.error('Please specify the reset key');
			return;
		}
		if ($scope.pw1 == null || $scope.pw1.length == 0) {
			alerts.error('Please specify a new password');
			return;
		}
		if (!angular.equals($scope.pw1, $scope.pw2)) {
			alerts.error('Please verify your new password');
			return;
		}
		$scope.state = 1;
		smuser.resetSetPassword($scope.email, $scope.key, $scope.pw1).
			success(function() {
				alerts.success('Password reset successfully');
				$location.path('/login/' + $scope.email);
			}).error(function() {
				$scope.state = 0;
			}).send();
	};
});

/** /login controller */
app.controller('loginController',
	function ($scope, $routeParams, $location, _smsess, smuser) {
		$scope.alert = {};
		$scope.user = {
			email: $routeParams.email,
			password: null
		};

		$scope.doLogin = function () {
			smuser.login($scope.user.email, $scope.user.password).
				success(function (data) {
					_smsess.sessionId(data['session_id']);
					_smsess.userId(data['user_id']);
					$location.path('/home');
				}).send();
			$scope.user.password = null;
		};
	});

/** /signup controller */
app.controller('signupController', function ($scope, $location, alerts, smuser) {
	$scope.form = {
		details: {}
	};

	function onSuccess(data) {
		alerts.success('Please check your e-mail to ' +
			'verify your account.');
		$location.path('/signup/verify/' + $scope.form.email);
	}

	$scope.doSignup = function () {
		smuser.signup($scope.form.email, $scope.form.password,
			$scope.form.details).success(onSuccess).send();
	};
});

/** /signup/verify controller */
app.controller('signupVerifyController',
	function ($scope, $location, $routeParams, alerts, smuser) {
		$scope.email = $routeParams.email;
		$scope.key = $routeParams.key;
		$scope.verifying = false;

		function onSuccess(data) {
			alerts.success('Account verified, you may now login.');
			$location.path('/login/' + $scope.email);
		}

		function onError(err) {
			var desc = smapi.describeError(err);
			alerts.error('Failed to verify account: ' + desc);
			$scope.verifying = false;
		}

		$scope.doVerify = function () {
			$scope.verifying = true;
			smuser.verify($scope.email, $scope.key).
				success(onSuccess).error(onError).
				send();
		};

		$scope.doResend = function () {
			smuser.resendVerify($scope.email).success(function (data) {
				alerts.success('Verification email resent.');
			}).send();
		};

		if (typeof $scope.key === 'string')
			$scope.doVerify();
	});

app.controller('accountController', function($scope, $routeParams, $location,
					     _smsess, smsess, smuser) {
	if (typeof $routeParams.userId === 'string' &&
	    ($routeParams.userId = $routeParams.userId.trim()).length > 0) {
		$scope.userId = Number.parseInt($routeParams.userId);
		if (isNaN($scope.userId)) {
			$location.path('/account');
			return;
		}
	} else {
		$scope.userId = null;
	}

	$scope.permission = smuser.permission;
	$scope.hasPermission = smsess.hasPermission;

	$scope.hasSuPermission = function(p) {
		if ($scope.userId == null ||
		    $scope.userId == _smsess.userId())
			return true;
		return smsess.hasPermission(p);
	};
});

app.controller('accountProfileController', function($scope, $http, alerts, smuser) {

	$scope.countries = [];

	$http.get('inc/js/resources/country_alpha3.js').then(function (r) {
		$scope.countries = r.data;
	});

	smuser.get([smuser.field.email, smuser.field.details], null,
		   $scope.$parent.userId).
		success(function(user) {
			$scope.user = user;
		}).send();

	$scope.updateProfile = function() {
		smuser.set($scope.user, $scope.userId).
			success(function() {
				alerts.success('Profile updated');
			}).send();
	};

	$scope.pass = {
		current: null,
		first: null,
		second: null
	};

	$scope.updatePassword = function() {
		var p = $scope.pass;
		if (p.current == null || p.current.length == 0) {
			alerts.error('Current password not specified');
			return;
		}
		if (p.first == null || p.first.length == 0) {
			alerts.error('New password not specified');
			return;
		}
		if (!angular.equals(p.first, p.second)) {
			alerts.error('Please confirm password');
			return;
		}
		smuser.setPassword(p.current, p.first, $scope.$parent.userId).
			success(function() {
				alerts.success('Password updated');
			}).send();
		p.current = p.first = p.second = null;
	};

	$scope.resetPassword = function() {
		smuser.resetPassword($scope.user.email()).success(function() {
			alerts.success('Please check your e-mail for reset key');
		}).send();
	};
});

app.controller('accountBillingController', function($scope, $routeParams,
						    alerts, smuser) {

	$scope.userId = $scope.$parent.userId;
	$scope.invoiceId = null;

	smuser.get([smuser.field.creditLimit, smuser.field.creditNetTerm],
		   [smuser.balanceField.amount], $scope.$parent.userId).
		success(function(ub) {
			$scope.usrBal = ub;
		}).send();

	$scope.unpaidInvoices = null;
	$scope.lateInvoices = null;
	smuser.listInvoices([smuser.invoiceField.state, smuser.invoiceField.dueDate],
			    [smuser.invoiceItemField.amount],
			    smuser.invoiceState.unpaid, null, null,
			    $scope.userId).
		success(function(invoices) {
			invoices.sort(function(x, y) {
				return x.dueDate() - y.dueDate();
			});
			$scope.unpaidInvoices = invoices;
		}).send();
	smuser.listInvoices([smuser.invoiceField.state, smuser.invoiceField.dueDate],
			    [smuser.invoiceItemField.amount],
			    smuser.invoiceState.late, null, null,
			    $scope.userId).
		success(function(invoices) {
			invoices.sort(function(x, y) {
				return x.dueDate() - y.dueDate();
			});
			$scope.lateInvoices = invoices;
		}).send();
});

app.controller('braintreePaymentController', function($scope, $location, alerts,
						      smapi, smuser) {
	$scope.userId = $scope.$parent.userId;
	$scope.invoiceId = null;
	$scope.paymentMethod = null;
	$scope.processingFee = 2.9;

	function updateInvoiceId(id) {
		if (id == $scope.invoiceId)
			return;
		if (typeof id !== 'number') {
			$scope.invoiceId = null;
			$scope.invoice = null;
			return;
		}
		$scope.invoiceId = id;
		$scope.loading = true;
		smuser.getInvoice($scope.invoiceId, [],
				  [smuser.invoiceItemField.amount],
				  $scope.userId).
			success(function(invoice) {
				$scope.invoice = invoice;
				$scope.loading = false;
				$scope.paymentAmount = invoice.total();
			}).send();
	}

	$scope.$parent.$watch('invoiceId', function(cur, prev) {
		updateInvoiceId(cur);
	});
	updateInvoiceId($scope.$parent.invoiceId);

	function makePayment(nonce, deviceData, callback) {
		$scope.paying = true;
		var amt = $scope.invoiceId == null ? $scope.paymentAmount : null;
		smuser.makeBraintreePayment(nonce, deviceData, amt,
					    $scope.invoiceId, $scope.userId).
			success(function(invoiceId) {
				if (callback)
					callback(invoiceId);
				$scope.paying = false;
				alerts.success('Invoice created ' + invoiceId);
				var target = invoiceId;
				if ($scope.userId != null)
					target = target + '/' + $scope.userId;
				$location.path('/account/invoice/' + target);
			}).
			error(function(res) {
				if (callback)
					callback(res);
				$scope.paying = false;
				alerts.error('Failed to void invoice: ' +
					     smapi.describeError(res));
				if (typeof res['code'] !== 'string')
					return;
				var msg = res['stage'] + '-' + res['code'];
				if (typeof res['text'] === 'string')
					msg = msg + ': ' + res['text'];
				if (typeof res['desc'] === 'string')
					msg = msg + ' (' + res['desc'] + ')';
				alerts.popAlert(msg);
			}).send();
	}

	$scope.cancel = function() {
		$scope.paymentMethod.destroy();
		$scope.paymentMethod = null;
	};

	$scope.creditCard = {
		addHostedFieldHandlers: function() {
			this.hostedFields.on('validityChange', function(e) {
                        	var field = e.fields[e.emittedBy];
                       		if (field.isValid) {
                       			if (e.emittedBy === 'expirationMonth' ||
                       			    e.emittedBy === 'expirationYear') {
                       				if (!e.fields.expirationMonth.isValid ||
                      				    !e.fields.expirationYear.isValid)
                        				return;
                        		} else if (e.emittedBy === 'number') {
                        			$scope.creditCard.invalidNumber = false;
                       			}
                        		$(field.container).parents('.form-group').
                        			addClass('has-success');
                       		} else if (field.isPotentiallyValid) {
                       			$(field.container).parents('.form-group').
                    				removeClass('has-warning');
                        		$(field.container).parents('.form-group').
                       				removeClass('has-success');
               				if (e.emittedBy === 'number')
                				$scope.creditCard.invalidNumber = false;
                        		} else {
                        			$(field.container).parents('.form-group').
                        				addClass('has-warning');
                        			if (e.emittedBy === 'number')
                        				$scope.creditCard.invalidNumber = true;
                        		}
                        });
                        this.hostedFields.on('cardTypeChange', function(e) {
                        	if (e.cards.length === 1) {
                        		$scope.creditCard.type = e.cards[0].niceType;
                       		} else {
                        		$scope.creditCard.type = null;
                        	}
                        });
                        $scope.loading = false;
		},
		loadHostedFields: function() {
			braintree.hostedFields.create({
				client: $scope.creditCard.client,
                		styles: {
                			'input': {
                				'font-size': '14px',
                				'font-family': 'helvetica, tahoma, calibri, sans-serif',
                				'color': '#3a3a3a'
                			},
                			':focus': {
                				'color': 'black'
                			}
                		},
                		fields: {
                			number: {
                				selector: '#braintree-cc-number',
                				placeholder: '4111 1111 1111 1111'
                			},
                			cvv: {
                				selector: '#braintree-cc-cvv',
                				placeholder: '123'
                			},
                			expirationMonth: {
                				selector: '#braintree-cc-exp-mo',
                				placeholder: 'MM'
                			},
                			expirationYear: {
                				selector: '#braintree-cc-exp-yr',
                				placeholder: 'YY'
                			},
                			postalCode: {
                				selector: '#braintree-cc-zip',
                				placeholder: '90210'
                			}
                		}
                	}, function(err, hostedFields) {
                		if (err) {
                			$scope.cancel();
                			alerts.error('Failed to load fields: ' + err);
                			return;
                		}
                		$scope.creditCard.hostedFields = hostedFields;
                		$scope.creditCard.addHostedFieldHandlers();
                	});
		},
		init: function() {
			$scope.loading = true;
                        smuser.getBraintreeToken($scope.userId).success(function(tok) {
                        	braintree.client.create({
                        		authorization: tok
                        	}, function(err, client) {
                        		if (err) {
                        			$scope.cancel();
                        			alerts.error('Failed to load: ' + err);
                        			return;
                        		}
                        		$scope.creditCard.client = client;
                        		braintree.dataCollector.create({
                        			client: client,
                        			kount: true
                        		}, function(err, dataCollector) {
                        			if (err) {
                        				$scope.cancel();
                        				alerts.error('Failed to load (DC): ' + err);
                        				return;
                        			}
                        			$scope.creditCard.dataCollector = dataCollector;
                        			$scope.creditCard.loadHostedFields();
                        		});
                        	});
                        }).send();
		},
		destroy: function() {
			this.client = null;
			if (this.dataCollector) {
				this.dataCollector.teardown();
				this.dataCollector = null;
			}
			if (this.hostedFields) {
				this.hostedFields.teardown();
				this.hostedFields = null;
			}
		},
		pay: function() {
			this.hostedFields.tokenize(function(err, payload) {
				if (err) {
					alerts.error('Failed to begin payment: ' + err.message);
					return;
				}
				$scope.paying = true;
				makePayment(payload.nonce,
					    $scope.creditCard.dataCollector.deviceData);
			});
		}
	};

	$scope.paypal = {
		btn: null,
		pay: function() {
			if ($scope.paymentAmount < 100) {
				alerts.error('Minimum payment of $100 required.');
				return;
			}
			$scope.paypal.btn.setAttribute('disabled', true);
			$scope.paying = true;
			this.paypal.tokenize({
				flow: 'vault'
			}, function(err, payload) {
				if (err) {
					if (err.type === 'CUSTOMER')
						return;
					alerts.error('Failed to tokenize: ' + err);
					return;
				}
				makePayment(payload.nonce,
					    $scope.paypal.dataCollector.deviceData,
					    function() {
					    	$scope.paypal.btn.setAttribute('disabled', false);
					    });
			});
		},
		loadPaypal: function() {
			braintree.paypal.create({
				client: $scope.paypal.client
			}, function(err, paypal) {
				if (err) {
					$scope.cancel();
					alerts.error('Failed to load Paypal: ' + err);
					return;
				}
				$scope.paypal.paypal = paypal;
				$scope.loading = false;
			});
		},
		loadButton: function() {
			var btn = document.querySelector('#paypal-button');
			btn.addEventListener('click', function(e) {
                        	$scope.paypal.pay();
                        }, false);
                        this.btn = btn;
		},
		init: function() {
			$scope.loading = true;
			if (this.btn == null)
				this.loadButton();
			smuser.getBraintreeToken($scope.userId).success(function(tok) {
				braintree.client.create({
					authorization: tok
				}, function(err, client) {
					if (err) {
						$scope.cancel();
						alerts.error('Failed to load: ' + err);
						return;
					}
					$scope.paypal.client = client;
					braintree.dataCollector.create({
						client: client,
						kount: true
					}, function(err, dataCollector) {
						if (err) {
							$scope.cancel();
							alerts.error('Failed to load (DC): ' + err);
							return;
						}
						$scope.paypal.dataCollector = dataCollector;
						$scope.paypal.loadPaypal();
					});
				});
			}).send();
		},
		destroy: function() {
                	this.client = null;
                	if (this.dataCollector) {
                		this.dataCollector.teardown();
                		this.dataCollector = null;
                	}
                	if (this.paypal) {
                		this.paypal.teardown();
                		this.paypal = null;
                	}
                }
	};

	$scope.selectPaymentMethod = function(method) {
		$scope.paymentMethod = method;
		method.init();
	};
});

app.controller('accountInvoicesController', function($scope, $routeParams,
						     alerts, smuser) {

	$scope.invoices = null;
	$scope.invoiceState = smuser.invoiceState;

	var fields = [
		smuser.invoiceField.state,
		smuser.invoiceField.dueDate,
		smuser.invoiceField.createDate,
		smuser.invoiceField.paidDate
	];
	var itemFields;
	if ($scope.$parent.hasSuPermission(smuser.permission.allPayment)) {
		itemFields = [smuser.invoiceItemField.amount];
	} else {
		itemFields = null;
	}
	smuser.listInvoices(fields, itemFields, null, null, null,
			    $scope.$parent.userId).
		success(function(res) {
			res.sort(function(x, y) {
				return y.dueDate() - x.dueDate();
			});
			$scope.invoices = res;
		}).send();

});

app.controller('accountInvoiceController', function($scope, $routeParams,
						    alerts, smapi, smsess, smuser) {

	$scope.invoiceState = smuser.invoiceState;

	if (typeof $routeParams.userId === 'string' &&
	    ($routeParams.userId = $routeParams.userId.trim()).length > 0)
		$scope.userId = Number.parseInt($routeParams.userId);
	else
		$scope.userId = null;

	$scope.admin = smsess.hasPermission(smuser.permission.allUserInvoice);
	$scope.hasPayment = $scope.userId == null ||
			    smsess.hasPermission(smuser.permission.allUserPayment);

	$scope.invoiceId = Number.parseInt($routeParams.id);

	var fields = [smuser.invoiceField.state,
		      smuser.invoiceField.dueDate,
		      smuser.invoiceField.createDate,
		      smuser.invoiceField.paidDate ];
	var itemFields = [smuser.invoiceItemField.name];
	if ($scope.hasPayment) {
		fields.push(smuser.invoiceField.credited);
		itemFields.push(smuser.invoiceItemField.amount);
	}
	smuser.getInvoice($scope.invoiceId, fields, itemFields, $scope.userId).
		success(function(invoice) {
			$scope.invoice = invoice;
		}).send();


	$scope.render = function() {
		$scope.rendering = true;
		smuser.renderInvoice($scope.invoiceId, $scope.userId).
			success(function(blob) {
				var a = document.getElementById("invoice-render-download");
				a.download = "invoice" + $scope.invoiceId + ".pdf";
				a.href = URL.createObjectURL(blob);
				a.click();
				$scope.rendering = false;
			}).send();
	};

	$scope.beginMarkPaid = function() {
		if ($scope.hasPayment)
			$scope.invoice.credited($scope.invoice.total());
		$('#invoice-paid-date').datetimepicker({
                	'format': 'MM/DD/YYYY',
                	'showClose': false,
                	'minDate': $scope.invoice.createDate()
                });
		$('#markPaidModal').modal('show');
	};

	$scope.markPaid = function() {
		$scope.invoice.paidDate($('#invoice-paid-date').
				data('DateTimePicker').date().toDate());
		$scope.markingPaid = true;
		smuser.paidInvoice($scope.invoiceId, $scope.invoice.paidDate(),
				   $scope.invoice.credited(), $scope.userId).
			success(function() {
				$scope.invoice.state(smuser.invoiceState.paid);
				$('#markPaidModal').modal('hide');
				$scope.markingPaid = false;
				alerts.success('Invoice marked paid');
			}).send();
	};

	$scope.markVoid = function() {
		$scope.markingVoid = true;
		smuser.voidInvoice($scope.invoiceId, $scope.userId).
			success(function() {
				$scope.markingVoid = false;
				$scope.invoice.state(smuser.invoiceState.cancelled);
				alerts.success('Invoice voided');
			}).
			error(function(res) {
				alerts.error('Failed to void invoice: ' +
					     smapi.describeError(res));
				if (typeof res['code'] !== 'string')
					return;
				var msg = res['stage'] + '-' + res['code'];
				if (typeof res['text'] === 'string')
					msg = msg + ': ' + res['text'];
				if (typeof res['desc'] === 'string')
					msg = msg + ' (' + res['desc'] + ')';
				alerts.popAlert(msg);
			}).send();
	};
});

app.controller('paymentsController',
	function ($scope, $routeParams, alerts, smuser) {

	});

app.controller('adminController', function($scope, smuser, smsess) {

	$scope.permission = smuser.permission;
	$scope.hasPermission = smsess.hasPermission;
});

app.controller('adminUsersController', function($scope, smuser) {
	$scope.unverifiedUsers = null;
	$scope.verifiedUsers = null;
	$scope.filteredUnverifiedUsers = null;
	$scope.filteredVerifiedUsers = null;
	$scope.filteredVerifiedText = null;
	$scope.filteredUnverifiedText = null;
	$scope.verifiedOffset = 0;
	$scope.verifiedLimit = 10;
	$scope.unverifiedOffset = 0;
	$scope.unverifiedLimit = 10;

	function filter(users, text) {
		if (typeof text !== 'string')
			return users;
		text = text.toLowerCase().trim();
		if (text.length === 0)
			return users;
		var res = [];
		for (var i = 0; i != users.length; i++) {
			var u = users[i];
			var f = u.details().firstName();
			var l = u.details().lastName();
			var c = u.details().company();
			var e = u.email();
			var ok = (typeof e === 'string' &&
				  e.toLowerCase().includes(text)) ||
				 (typeof c === 'string' &&
				  c.toLowerCase().includes(text)) ||
				 (typeof l === 'string' &&
				  l.toLowerCase().includes(text)) ||
				 (typeof f === 'string' &&
				  f.toLowerCase().includes(text));
			if (ok)
				res.push(u);
		}
		return res;
	}

	$scope.hasPrevVerified = function() {
		if ($scope.verifiedUsers == null)
			return false;
		return ($scope.verifiedOffset - $scope.verifiedLimit) >= 0;
	};

	$scope.hasNextVerified = function() {
		if ($scope.verifiedUsers == null)
			return false;
		return ($scope.verifiedOffset + $scope.verifiedLimit) <=
			$scope.verifiedUsers.length;
	};

	$scope.nextVerified = function() {
		$scope.verifiedOffset += $scope.verifiedLimit;
	};

	$scope.prevVerified = function() {
		$scope.verifiedOffset -= $scope.verifiedLimit;
	};

	$scope.filterVerified = function() {
		$scope.filteredVerifiedUsers = filter($scope.verifiedUsers,
						      $scope.filteredVerifiedText);
	};

	$scope.hasPrevUnverified = function() {
		if ($scope.unverifiedUsers == null)
			return false;
		return ($scope.unverifiedOffset - $scope.unverifiedLimit) >= 0;
	};

	$scope.hasNextUnverified = function() {
		if ($scope.unverifiedUsers == null)
			return false;
		return ($scope.unverifiedOffset + $scope.unverifiedLimit) <=
			$scope.unverifiedUsers.length;
	};

	$scope.nextUnverified = function() {
		$scope.unverifiedOffset += $scope.unverifiedLimit;
	};

	$scope.prevUnverified = function() {
		$scope.unverifiedOffset -= $scope.unverifiedLimit;
	};

	$scope.filterUnverified = function() {
		$scope.filteredUnverifiedUsers = filter($scope.unverifiedUsers,
							$scope.filteredUnverifiedText);
	};

	function cmpUsr(x, y) {
		if (x.details().firstName() < y.details().firstName())
			return -1;
		if (x.details().firstName() > y.details().firstName())
			return 1;
		return 0;
	}

	smuser.list([smuser.field.details, smuser.field.email], null, true).
		success(function(users) {
			users.sort(cmpUsr);
			$scope.verifiedUsers = users;
			$scope.filterVerified();
		}).send();
	smuser.list([smuser.field.details, smuser.field.email], null, false).
		success(function(users) {
			users.sort(cmpUsr);
			$scope.unverifiedUsers = users;
			$scope.filterUnverified();
		}).send();
});

app.controller('adminUserController', function($scope, $routeParams, alerts,
					       smsess, smuser) {
	$scope.userId = parseInt($routeParams.id);
	$scope.user = null;
	$scope.balance = null;
	$scope.hasPayment = smsess.hasPermission(smuser.permission.allUserPayment);
	$scope.hasInvoice = smsess.hasPermission(smuser.permission.allUserInvoice);
	$scope.permission = smuser.permission;
	$scope.invoiceState = smuser.invoiceState;

	var usrFields = [smuser.field.permissions, smuser.field.details];
	var balFields = null;
	if ($scope.hasPayment) {
		balFields = [smuser.balanceField.amount];
		usrFields.push(smuser.field.creditLimit);
		usrFields.push(smuser.field.creditNetTerm);
		usrFields.push(smuser.field.markup);
	}

	smuser.get(usrFields, balFields, $scope.userId).success(function(res) {
		if ($scope.hasPayment) {
			$scope.user = res.user();
			$scope.balance = res.balance();
		} else {
			$scope.user = res;
		}
	}).send();

	$scope.userMarkup = function(upd) {
		if ($scope.user == null)
			return null;
		if (arguments.length)
			$scope.user.markup(upd / 100);
		else
			return $scope.user.markup() * 100;
	}

	$scope.updatePermissions = function() {
		var usr = new smuser.User();
		usr.permissions($scope.user.permissions());
		smuser.set(usr, $scope.userId).success(function() {
			alerts.success('Permissions updated');
		}).send();
	};

	$scope.updatePayment = function() {
		var usr = new smuser.User();
		usr.creditLimit($scope.user.creditLimit());
		usr.creditNetTerm($scope.user.creditNetTerm());
		usr.markup($scope.user.markup());
		smuser.set(usr, $scope.userId).success(function() {
			alerts.success('Payment information updated');
		}).send();
	};

	if ($scope.hasInvoice) {
		var invFields = [
			smuser.invoiceField.createDate,
			smuser.invoiceField.dueDate,
			smuser.invoiceField.state
		];
		var invItemFields;
		if ($scope.hasPayment) {
			invItemFields = [smuser.invoiceItemField.amount];
		} else {
			invItemFields = null;
		}

		$scope.invoices = null;
		$scope.loadingInvoices = true;

		var numRecv = 0;

		function appendInvoices(invoices) {
			if ($scope.invoices == null)
				$scope.invoices = invoices;
			else
				$scope.invoices = invoices.concat($scope.invoices);
			if (++numRecv == 2)
				$scope.loadingInvoices = false;
		}

		smuser.listInvoices(invFields, invItemFields,
				    smuser.invoiceState.unpaid, null, null,
				    $scope.userId).
			success(appendInvoices).send();
		smuser.listInvoices(invFields, invItemFields,
				    smuser.invoiceState.late, null, null,
				    $scope.userId).
			success(appendInvoices).send();
	}

	$scope.newInvoice = {
		dueDate: $('#new-invoice-due-date').datetimepicker({
			'format': 'MM/DD/YYYY',
			'showClose': true
		}),
		items: [],
		state: smuser.invoiceState.unpaid,
		credited: 0.0
	};

	$scope.newInvoiceItem = function() {
		$scope.newInvoice.items.push(new smuser.InvoiceItem());
	};

	$scope.removeNewInvoiceItem = function(item) {
		$scope.newInvoice.items.splice(
			$scope.newInvoice.items.indexOf(item), 1);
	};

	$scope.createInvoice = function() {
		var def = $scope.newInvoice;
		var invoice = new smuser.Invoice();

		if (def.items.length == 0) {
			alerts.error('At least one invoice item is required');
			return;
		}

		var tot = 0.0;
		for (var i = 0; i != def.items.length; i++) {
			var item = def.items[i];
			if (typeof item.name() !== 'string' ||
			    typeof item.amount() !== 'number') {
				alerts.error('Remove invalid invoice items');
				return;
			}
			tot += item.amount();
		}

		if (def.state == smuser.invoiceState.unpaid ||
		    def.state == smuser.invoiceState.late) {
			invoice.state(def.state);
			invoice.dueDate($('#new-invoice-due-date').
				data('DateTimePicker').date().toDate());
		} else if (def.state == smuser.invoiceState.paid) {
			invoice.state(smuser.invoiceState.paid);
			if (def.credited > 0)
				invoice.credited(def.credited);
		} else {
			alerts.error('Select valid invoice state');
			return;
		}

		invoice.items(def.items);

		smuser.createInvoice(invoice, $scope.userId).
			success(function() {
				alerts.success('Created invoice');
				$scope.newInvoice.items = [];
				$scope.newInvoice.state = smuser.invoiceState.unpaid;
				$scope.newInvoice.credited = 0.0;
			}).send();
	};
});

app.controller('adminApprovalsController', function($scope, $http, alerts,
						    smcampaign, smuser,
						    API_HOST) {

	$scope.pending = null;
	$scope.userName = null;
	$scope.campaignName = null;
	$scope._campaignIabCats = null;
	$scope.activeLinks = null;

	$scope.campaignIabCats = function() {
		if (!arguments.length)
			return $scope._campaignIabCats;
	};

	$http.get('inc/js/resources/iab_cats.js').then(function (r) {
		$scope.iabCats = r.data;
	});

	$scope.resolveCreativeSrc = function (iid) {
		return API_HOST + '/campaign/get/creative/data/' +
			$scope.pending.userId()+ '/' +
			$scope.pending.campaignId() + '/' + iid;
	};

	function appendActiveLinks(lns) {
		if ($scope.activeLinks == null)
			$scope.activeLinks = lns;
		else
			$scope.activeLinks = $scope.activeLinks.concat(lns);
	}

	$scope.loadNext = function() {
		smcampaign.pollPending().success(function(p) {
			if (p == null) {
				alerts.success('No pending campaigns');
				return;
			}
			$scope.pending = p;
			smcampaign.get(p.campaignId(),
				[smcampaign.field.name,
				 smcampaign.field.iabCats], null,
				p.userId()).success(function(c) {
					$scope.campaignName = c.campaign.name();
					$scope._campaignIabCats = c.campaign.iabCats();
				}).send();
			smcampaign.listLinks(p.campaignId(),
				[smcampaign.linkField.name,
				 smcampaign.linkField.url,
				 smcampaign.linkField.adomain],
				smcampaign.itemState.active,
				p.userId()).success(appendActiveLinks).send();
			smcampaign.listLinks(p.campaignId(),
				[smcampaign.linkField.name,
				 smcampaign.linkField.url,
				 smcampaign.linkField.adomain],
				smcampaign.itemState.paused,
				p.userId()).success(appendActiveLinks).send();
			smuser.get([smuser.field.details], null, p.userId()).
				success(function(usr) {
					var deets = usr.details();
				   	if (deets.company())
				   		$scope.userName = deets.company();
				   	else
				   		$scope.userName =
				   			deets.firstName() + ' ' +
				   			deets.lastName();
				}).send();
		}).send();
	};

	function removePendingItem(item) {
		var pending = $scope.pending;
		var arr = item instanceof smcampaign.Link ?
			pending.links() : pending.creatives();
		arr.splice(arr.indexOf(item), 1);
		if ((pending.links() == null || pending.links().length === 0) &&
		    (pending.creatives() == null || pending.creatives().length === 0)) {
			$scope.pending = null;
			$scope.activeLinks = null;
			$scope._campaignIabCats = null;
			$scope.campaignName = null;
			$scope.userName = null;
		}
	}

	$scope.approveLink = function(ln) {
		var pending = $scope.pending;
		smcampaign.setLinkState(pending.campaignId(), ln.id(),
					smcampaign.itemState.active,
					pending.userId()).
				success(function() {
					alerts.success('Approved ' + ln.name());
					removePendingItem(ln);
				}).send();
	};

	$scope.approveCreative = function(cr) {
		var pending = $scope.pending;
		smcampaign.setCreativeState(pending.campaignId(), cr.id(),
					    smcampaign.itemState.active,
					    pending.userId()).
				success(function() {
					alerts.success('Approved ' + cr.name());
					removePendingItem(cr);
				}).send();
	};

	/* item pending disapproval */
	$scope.disapproveItem = null;
	/* reason for disapproving item */
	$scope.disapproveReason = null;

	$scope.disapproveLink = function(link) {
		$scope.disapproveItem = link;
		$scope.disapproveReason = null;
		$('#disapprovalModal').modal('show');
	};

	$scope.disapproveCreative = function(creative) {
		$scope.disapproveItem = creative;
		$('#disapprovalModal').modal('show');
	};

	$scope.cancelDisapprove = function() {
		$scope.disapproveItem = null;
		$scope.disapproveReason = null;
	};

	$scope.disapprove = function() {
		var pending = $scope.pending;
		var item = $scope.disapproveItem;
		var reason = $scope.disapproveReason;
		var rq;
		if (item instanceof smcampaign.Link)
			rq = smcampaign.rejectLink(pending.campaignId(),
						   item.id(), reason,
						   pending.userId());
		else
			rq = smcampaign.rejectCreative(pending.campaignId(),
						       item.id(), reason,
						       pending.userId());
		rq.success(function() {
			alerts.success('Rejected ' + item.name());
			removePendingItem(item);
			$('#disapprovalModal').modal('hide');
		}).send();
	};
});

/** Router configuration. */
app.config(function ($routeProvider, $sceDelegateProvider, API_HOST) {
	$sceDelegateProvider.resourceUrlWhitelist(
		['self', API_HOST + '/**']);

	$routeProvider.when('/home/:userId?', {
		controller: 'homeController',
		templateUrl: 'inc/templates/home.html',
		resolve: {
			auth: function ($q, _smsess) {
				if (!_smsess.isValid())
					return $q.reject({});
			}
		}
	}).when('/admin', {
		controller: 'adminController',
		templateUrl: 'inc/templates/admin/admin.html'
	}).when('/admin/user/:id', {
		controller: 'adminUserController',
		templateUrl: 'inc/templates/admin/user.html'
	}).when('/campaigns/:userId?', {
		controller: 'campaignsController',
		templateUrl: 'inc/templates/campaigns/campaigns.html'
	}).when('/campaign/edit/:id?/:userId?', {
		controller: 'campaignController',
		templateUrl: 'inc/templates/campaigns/edit.html'
	}).when('/reports/:id?/:userId?', {
		controller: 'reportController',
		templateUrl: 'inc/templates/reports/reports.html'
	}).when('/intelligence', {
		controller: 'reportController',
		templateUrl: 'inc/templates/reports/reports.html'
	}).when('/login/forgot', {
		controller: 'loginForgotController',
		templateUrl: 'inc/templates/account/forgot.html'
        }).when('/login/forgot/reset/:email?/:key?', {
		controller: 'loginResetController',
		templateUrl: 'inc/templates/account/reset.html'
        }).when('/login/:email?', {
		controller: 'loginController',
		templateUrl: 'inc/templates/account/login.html'
	}).when('/account/:userId?', {
		controller: 'accountController',
		templateUrl: 'inc/templates/account/account.html'
	}).when('/account/invoice/:id?/:userId?', {
		controller: 'accountInvoiceController',
		templateUrl: 'inc/templates/account/invoice.html'
	}).when('/support', {
		templateUrl: 'inc/templates/support/support.html'
	}).when('/support/new', {
		templateUrl: 'inc/templates/support/new.html'
	}).when('/support/view/:id', {
		templateUrl: 'inc/templates/support/view.html'
	}).when('/signup', {
		controller: 'signupController',
		templateUrl: 'inc/templates/account/signup.html'
	}).when('/signup/verify/:email/:key?', {
		controller: 'signupVerifyController',
		templateUrl: 'inc/templates/account/verify.html'
	}).otherwise({
		redirectTo: '/home'
	});
});

app.run(function ($rootScope, $location, _smsess, smuser) {
	google.charts.load('current', {'packages': ['geochart']});
	Chart.defaults.global.defaultFontColor = "#aaa";

	$rootScope.$on('$routeChangeStart', function () {
		var path = $location.path();
		/* Make sure they're logged in first, then send them to home */
		if (path.indexOf('/login') !== 0 && !_smsess.isValid()) {
			/*
			 * Don't redirect them to login if they're trying to
			 * signup or looking at docs.
			 */
			if (path.indexOf('/signup') !== 0 &&
				path.indexOf('/support/docs') !== 0)
				$location.path('/login');
		} else if (path.indexOf('/login') === 0 && _smsess.isValid()) {
			$location.path('/home');
		} else if (path.indexOf('/logout') === 0) {
			smuser.logout().
				success(function (data) {
					$location.path('/login');
				}).send();
		}
	});
});
