// A tiny stand-in for the Jira REST API v2, enough for the commands docs/start/jira.md and docs/start/roadmap.md tell
// people to run. Prints the port it listens on; accepts ana@example.com + test-token (Basic auth) and knows one issue,
// PROJ-1. Created issues get PROJ-2, PROJ-3… and are kept with their links, for GET /_created.
import { createServer } from 'node:http';

const auth = `Basic ${Buffer.from('ana@example.com:test-token').toString('base64')}`;
const statuses = ['To Do', 'In Design', 'In Progress', 'In Review', 'Done'];
let status = 'To Do';
const created = [];
const links = [];
const body = (req, then) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => then(JSON.parse(raw || '{}')));
};
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const server = createServer((req, res) => {
  if (req.url === '/_created') return json(res, 200, { created, links });
  if (req.headers.authorization !== auth) return json(res, 401, { errorMessages: ['Client must be authenticated to access this resource.'] });
  const path = (req.url ?? '').split('?')[0];
  if (req.method === 'GET' && path === '/rest/api/2/issue/PROJ-1')
    return json(res, 200, { key: 'PROJ-1', fields: { summary: 'Mark a to-do as done', status: { name: status }, issuetype: { name: 'Story' }, description: null } });
  if (req.method === 'GET' && path === '/rest/api/2/issue/PROJ-1/transitions')
    return json(res, 200, { transitions: statuses.filter((s) => s !== status).map((s, i) => ({ id: String(i + 11), name: s, to: { name: s } })) });
  if (req.method === 'POST' && path === '/rest/api/2/issue/PROJ-1/transitions') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const id = Number(JSON.parse(body).transition.id) - 11;
      status = statuses.filter((s) => s !== status)[id] ?? status;
      json(res, 204);
    });
    return;
  }
  if (req.method === 'POST' && path === '/rest/api/2/issue')
    return body(req, ({ fields }) => {
      const key = `PROJ-${created.length + 2}`;
      created.push({ key, summary: fields.summary, type: fields.issuetype?.name, parent: fields.parent?.key ?? null, labels: fields.labels ?? [] });
      json(res, 201, { id: String(10000 + created.length), key });
    });
  if (req.method === 'POST' && path === '/rest/api/2/issueLink')
    return body(req, (l) => {
      links.push(`${l.inwardIssue.key} blocks ${l.outwardIssue.key}`);
      json(res, 201);
    });
  if (req.method === 'GET' && path === '/rest/api/2/project/PROJ/statuses') return json(res, 200, [{ name: 'Story', statuses: statuses.map((name) => ({ name })) }]);
  json(res, 404, { errorMessages: ['Issue does not exist or you do not have permission to see it.'] });
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
