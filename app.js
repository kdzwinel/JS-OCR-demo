// put this file in /dist/intergration
/*  
  -- do --

  git init -y
  npm i express
  nodemon app.js

  -- end --
*/

const express = require('express');
const app = express();
const path = require('path');

app.use(express.static('./'));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname+'/index.html'))
});

app.listen(1765, function () {
  console.log('Example app listening on port 1764!');
});

