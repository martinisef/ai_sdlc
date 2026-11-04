// A tiny stand-in for the Jira REST API v2, enough for the commands docs/start/jira.md tells people to run.
// Prints the port it listens on; accepts ana@example.com + test-token (Basic auth) and knows one issue, PROJ-1.
import { createServer } from 'node:http';

const auth = `Basic ${Buffer.from('ana@example.com:test-token').toString('base64')}`;
const statuses = ['To Do', 'In Design', 'In Progress', 'In Review', 'Done'];
let status = 'To Do';
const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const server = createServer((req, res) => {
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
  if (req.method === 'GET' && path === '/rest/api/2/project/PROJ/statuses') return json(res, 200, [{ name: 'Story', statuses: statuses.map((name) => ({ name })) }]);
  json(res, 404, { errorMessages: ['Issue does not exist or you do not have permission to see it.'] });
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
