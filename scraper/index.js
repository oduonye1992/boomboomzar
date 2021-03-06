var express = require('express');
var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');
var app     = express();
var async = require('asyncawait/async');
var await = require('asyncawait/await');
var Promise = require('bluebird');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var db = null;

function Scraper(serviceId, conf){
    var configuration = conf;
    var scrapeData = [];
    var loadPage = function(url){
        return new Promise(function(resolve, reject){
            console.log('Evaluating '+url);
            request(url, function(error, response, html){
                if(!error){
                    resolve(html);
                } else {
                    reject(error);
                }
            })
        });
    };
    var getChildrenForNode = function(nodeID){
        return configuration.selectors.filter(function(sel){
            return sel.parentSelectors.indexOf(nodeID) > -1
        });
    };
    function updateService(data){
        for (var key in data) {
            db.collection('data').insert({
                key : key,
                value : data[key],
                service : serviceId
            });
        }
        console.log('Updated');
    }
    var analyzeNode = function(html, node, dataObj) {
        return new Promise(async (function(resolve, reject) {
            var $ = cheerio.load(html);
            if (node.type === 'SelectorLink'){
                if (node.multiple){
                    if ($(node.selector).length){
                        for (var i = 0; i < $(node.selector).length; i++){
                            var sel = $(node.selector+':nth-of-type('+i+')');
                            var link = sel.attr('href');
                            var linkText = sel.html();
                            if (link){
                                dataObj[node.id] = linkText;
                                dataObj[node.id+'_href'] = link;
                                var linkHtml = await(loadPage(link));
                                getChildrenForNode(node.id).forEach(async(function(childNode){
                                    await(analyzeNode(linkHtml, childNode, dataObj));
                                }));
                            } else {
                                updateService(dataObj);
                                scrapeData.push(dataObj);
                            }
                        }
                        resolve();
                    }
                }
            } else if (node.type === 'SelectorText') {
                if (node.multiple){
                    if ($(node.selector).length) {
                        for (var j = 0; j < $(node.selector).length; j++){
                            var sell = $(node.selector+':nth-of-type('+j+')');
                            dataObj[node.id] = sell.html();
                            updateService(dataObj);
                            scrapeData.push(dataObj);
                        }
                    }
                } else {
                    console.log('no multiple');
                }
                console.log(dataObj);
                resolve();
            }
        }));
    };
    return {
        start : async(function(){
            var html = await(loadPage(configuration.startUrl));
            await(analyzeNode(html, configuration.selectors[0], {}));
        })
    }
}

var url = process.env.MONGO_URL;
MongoClient.connect(url, function(err, _db) {
    assert.equal(null, err);
    db = _db;
    console.log("Connected correctly to server.");
    var cursor = db.collection('services').find();
    console.log('Found '+cursor.count()+' records');
    if (cursor.count() == 0) return console.log('No record');
    cursor.forEach(function(service){
       try {
           new Scraper(service._id, JSON.parse(service.configuration)).start();
       } catch (e) {
           console.log(e);
       }
    });
    //db.close();
});

app.listen('2018');

exports = module.exports = app;