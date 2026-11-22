// Finds public test content: recent archived VODs (id, length) for channels, via the same shim.
// Usage: node find-content.mjs <channel> [...]
import { http } from './iina-http-shim.mjs';
for (const login of process.argv.slice(2)) {
  try {
    const r = await http.post('https://gql.twitch.tv/gql', {
      headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
      data: { query: 'query($l:String!){user(login:$l){stream{id} videos(first:5,type:ARCHIVE){edges{node{id lengthSeconds createdAt}}}}}', variables: { l: login } },
    });
    const u = r.data.data.user;
    console.log(login, 'live=' + !!(u && u.stream), (u ? u.videos.edges : []).map(e => e.node.id + ':' + e.node.lengthSeconds + 's').join(' '));
  } catch (e) { console.log(login, 'err', e.statusCode); }
}
