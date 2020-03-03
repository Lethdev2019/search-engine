// note to adcharity, webserver does not stay running for long because ==>
// App
const express = require('express'),
	app = express(),
	serv = require('http').Server(app),
	port = process.env.PORT || 2000,

	// General modules
	fs = require('fs'),
	path = require('path'),

	// Scraping
	cheerio = require('cheerio'),
    request = require('request'),
    url = require('url'),

	// My modules
	{ purge } = require('./modules/general.js'),
	{ dev, seek } = require('./modules/config.js'),
	Database = require('./database/Database.js'),

	// Getting information
	wd = require('word-definition'),
	urlMetadata = require('url-metadata'),
	Crawler = require("crawler"),

	// Templating
	EJS = require('ejs');

// Static Info
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('views'));

// Force https
app.use(function (req, res, next) {
	if (req.headers['x-forwarded-proto'] === 'http') {
		res.redirect(301, `https://${req.headers.host}/${req.url}`)
	}
	else next()
})

serv.listen(port);
console.log('Server started.');

let database = {};
database.testing = new Database('testing.json');
database.images = new Database('images.json');

let crawler = new Crawler();
let obselete = new Array;

if(dev){
	// for(let key in database){
	// 	let real = database[key];
	// 	real.sync()
	// }
	for(let link of seek){
		imageCrawl(link)
		linkCrawl(link)
	}

	// let data = database.testing.data;
	// for(let key in data){
	// 	imageCrawl(key)
	// }

}
function imageCrawl(link) {
	let results = new Array;

	if(!link[0] == 'h') return;


	request.get(link, (error, response, body) => {
		let $ = cheerio.load(body);

		$("img").each((i, image) => {
			results.push(url.resolve(link, $(image).attr('src')));
		});

		for(let image of results){
			// database.images.save(image, {source: new URL(seek).origin})
			database.images.save(image, {source: link})
		}
		// linkCrawl(link)
	})
}
function linkCrawl(link) {
	console.log(`LINK: Crawling ${link}`);
	crawler.queue({
		uri: link,
		callback: function (err, res, done) {
			if (err) throw err;
			let $ = res.$;
			try {
				let urls = $("a");
				
				Object.keys(urls).forEach((item) => {
					if (urls[item].type === 'tag') {
						let href = urls[item].attribs.href;
						if (href && !href.includes('javascript') && !obselete.includes(href)) {

							obselete.push(href)
							href = href.trim();


							urlMetadata(href)
							.then((metadata) => {
								database.testing.save(href, {
									title: metadata['title'] || metadata['og:site_name'],
									description: metadata['description'] || metadata['og:description'],
									keywords: metadata['keywords'] || metadata['og:article:tag'] || metadata['title'] || metadata['og:site_name'] 
								})
							})
							setTimeout(function() {
								href.startsWith('http') ? linkCrawl(href) : linkCrawl(`${link}${href}`) 
								 
							}, 100000)

						}
					}
				});
			} 
			catch (e) {
				console.error(`Encountered an error crawling ${link}. Aborting crawl.`);
				done()
			}
			done();

		}
	})
}


app.get('/', (req, res) => {
	res.render("index");
});
app.get('/search', (req, res) => {
	let query = req.query.query;
	let type = req.query.type;
	
	if(!query || !type) return res.render('pages/error');

	switch(type){
		case 'all': 
			let retrieveResults = new Promise((resolve, reject) => {
				let data = database.testing.data;
				
				let results = {};
				for(let key in data){
					let potential = data[key];
					if(potential.title.includes(query) ||potential.keywords.includes(query) || potential.description.includes(query) || key.includes(query)){
						results[key] = potential
					}
				}
				resolve(results)
			})

			let retrieveDefinition = new Promise((resolve, reject) => {
				setTimeout(() => {
					reject(new Error("Not Found"))
				}, 1000)
				wd.getDef(query, "en", {exact: false}, (definition) => {
					resolve(definition)
				})
			});
			Promise.all([
				retrieveResults, 
				retrieveDefinition.catch((error) => {
					return {err: 'Not Found'}
				})
			]).then((values) => { 
				let results = values[0],
					definition = values[1],
					renderObj = {
						count: Object.keys(results).length,
						query: query		
					};

				if(Object.keys(results).length > 0) renderObj['results'] = results; 

				if(!definition.hasOwnProperty('err')) renderObj['definition'] = definition;

				return renderObj
			}).then((renderObj) => {
				res.render('pages/all', renderObj);	
			})
		break;
		case 'images': 
			new Promise((resolve, reject) => {
				let data = database.images.data;

				let results = new Array;

				for(let key in data){
					let potential = data[key];
					if(potential.source.includes(query) || key.includes(query)){
						results.push(key)
					}
				}
				resolve(results)
			}).then((results) => {
				let renderObj = {
					query: query
				}
				if(Object.keys(results).length > 0) 	
					renderObj['results'] = results; 

				return renderObj
			}).then((renderObj) => {
				// console.log(renderObj)
				res.render('pages/images', renderObj);	
		
			})
		break;
		default: res.render('pages/error') 
	}
});
app.get('*', (req, res) => {
	res.status(404).render('pages/error')

});
// linkCrawl('http://duckduckgo.com')
