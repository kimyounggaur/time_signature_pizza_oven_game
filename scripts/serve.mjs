import http from 'node:http';
import {readFile} from 'node:fs/promises';
const args=process.argv.slice(2),portAt=args.indexOf('--port');
const port=Number(portAt>=0?args[portAt+1]:process.env.PORT||3000);
http.createServer(async(req,res)=>{try{const file=await readFile(new URL('../index.html',import.meta.url));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(file);}catch{res.writeHead(503);res.end('Run npm run build first.');}}).listen(port,'0.0.0.0',()=>console.log('Pizza oven on '+port));
