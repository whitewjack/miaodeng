import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const utilsPath = path.resolve(__dirname, '..', 'chrome-extension', 'autosubmit-utils.js');
const source = fs.readFileSync(utilsPath, 'utf8');

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'autosubmit-utils.js' });

const utils = sandbox.AutoSubmitUtils;
assert.ok(utils, 'AutoSubmitUtils should be exposed on global scope');
const toLocalArray = (arr) => Array.from(arr || []);

assert.equal(
  utils.normalizeDomainRule(' HTTPS://*.Login.Example.com:8443/path?q=1 '),
  'login.example.com'
);
assert.equal(utils.normalizeDomainRule(''), '');

assert.deepEqual(
  toLocalArray(utils.parseDomainRules('login.example.com\nhttps://secure.example.com/login,*.example.com;EXAMPLE.com:443')),
  ['login.example.com', 'secure.example.com', 'example.com']
);

assert.deepEqual(
  toLocalArray(utils.parseDomainRules(['foo.example.com', 'https://foo.example.com/login', 'bar.example.com'])),
  ['foo.example.com', 'bar.example.com']
);

const rules = utils.parseDomainRules('example.com\ninternal.company.local');
assert.equal(utils.isHostInNoSubmitList('example.com', rules), true);
assert.equal(utils.isHostInNoSubmitList('sso.example.com', rules), true);
assert.equal(utils.isHostInNoSubmitList('deep.sso.example.com', rules), true);
assert.equal(utils.isHostInNoSubmitList('another-example.com', rules), false);
assert.equal(utils.isHostInNoSubmitList('portal.internal.company.local', rules), true);

console.log('test_autosubmit_utils: all tests passed');
