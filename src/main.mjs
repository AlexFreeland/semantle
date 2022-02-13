import semantle from './semantle.mjs';

import http from 'http';
import fs from 'fs';

const configPath = 'config.json';
var config;

async function parseBody(req)
{
	return new Promise((resolve, reject) =>
	{
		let body = '';
		req.on('data', (chunk) =>
		{
			body += chunk;
		});
		req.on('end', () =>
		{
			resolve(body);
		});
		req.on('error', (err) =>
		{
			reject(err);
		});
	});
}

function parseCookies(req)
{
	let cookies = {};
	req.headers?.cookie?.split(';').forEach((cookie) =>
	{
		let crumbs = cookie.match(/^(.*?)=(.*)$/) ?? [];
		crumbs[1] = crumbs[1]?.trim();
		crumbs[2] = crumbs[2]?.trim();
		if (crumbs[1] && crumbs[2])
		{
			cookies[crumbs[1]] = crumbs[2];
		}
	});
	return cookies;
}

async function initServer()
{
	config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
	await semantle.initialize(config);

	let indexHtml = await fs.promises.readFile('www/index.html', { encoding: 'utf-8' });
	indexHtml = indexHtml.replace('{title}', config.strings.pageTitle);
	let leaderboardHtml = await fs.promises.readFile('www/leaderboard.html', { encoding: 'utf-8' });
	leaderboardHtml = leaderboardHtml.replace('{title}', config.strings.pageTitle);
	let semantleJs = await fs.promises.readFile('www/semantle.js', { encoding: 'utf-8' });
	semantleJs = semantleJs.replace('{xhrError}', config.strings.xhrError);
	semantleJs = semantleJs.replace('{sseError}', config.strings.sseError);
	let faviconIco = await fs.promises.readFile('www/favicon.ico');

	console.log('Starting http server...');
	const endpointHandlers =
	{
		'/': async (req, res) =>
		{
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.end(indexHtml);
		},
		'/leaderboard': async (req, res) =>
		{
			res.writeHead(200, {'Content-Type': 'text/html'});
			res.end(leaderboardHtml);
		},
		'/semantle.js': async (req, res) =>
		{
			res.writeHead(200, {'Content-Type': 'text/javascript'});
			res.end(semantleJs);
		},
		'/favicon.ico': async (req, res) =>
		{
			res.writeHead(200, {'Content-Type': 'image/x-icon'});
			res.end(faviconIco);
		},
		'/user': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let user = await semantle.initUser(userID);

			res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'});
			console.log(`${user.id} opened socket`);
			res.socket.on('close', () =>
			{
				console.log(`${user.id} closed socket`);
			});

			user.eventEmitter.on('joinGame', (user) =>
			{
				res.write('event: joinGame\n');
				res.write(`data: ${user.toJSON()}\n\n`);
			});
			user.eventEmitter.on('makeGuess', (guess) =>
			{
				res.write('event: makeGuess\n');
				res.write(`data: ${JSON.stringify(guess)}\n\n`);
			});

			user.eventEmitter.emit('joinGame', user);
		},
		'/game': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let game = await semantle.getGameInfo(userID);

			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(game));
		},
		'/target': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let target = await semantle.getTargetInfo(userID);

			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(target));
		},
		'/guess': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let word = JSON.parse(await parseBody(req)).word;

			let similarity = await semantle.guess(userID, word);

			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(similarity));
		},
		'/next': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let result = await semantle.advanceUser(userID);

			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(result));
		},
		'/setName': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let name = JSON.parse(await parseBody(req)).name;

			let response = await semantle.setUserName(userID, name);

			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(response));
		},
		'/scores': async (req, res) =>
		{
			let userID = parseCookies(req)['user_id'];
			let result = await semantle.getLeaderboard(userID);

			res.writeHead(200, {'Content-Type': 'application/json'});
			res.end(JSON.stringify(result));
		},
		'404': async (req, res) =>
		{
			res.writeHead(404);
			res.end(config.strings.error404);
		}
	}
	const server = http.createServer(async (req, res) =>
	{
		let requestStartTime = new Date();
		let url = new URL(req.url, `http://${req.headers.host}`);
		try
		{
			await (endpointHandlers[url.pathname] || endpointHandlers['404'])(req, res);
		}
		catch (err)
		{
			res.writeHead(500);
			res.end(config.strings.error500);
			
			console.log(`ERROR: ${err.message}`);
		}
		console.log(`Processed "${req.url}" in ${new Date() - requestStartTime}ms`);	//TODO: who cares? remove in prod
	});
	server.listen(config.server.bindPort, config.server.bindHost, () =>
	{
		console.log(`http server running at ${config.server.bindHost}:${config.server.bindPort}`);
	});
}

initServer().catch(console.log);