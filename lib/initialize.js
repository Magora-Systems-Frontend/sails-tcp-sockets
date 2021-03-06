/**
 * Module dependencies
 */
var net = require('net'),
    http = require('http'),
    appRoot = process.cwd(),
    socketMedium = require(appRoot + '/api/services/socketMedium.js'),
    StringDecoder = require('string_decoder').StringDecoder,
    crypto = require('crypto');


/**
 * @param  {Sails} app
 * @return {Function}     [initialize]
 */
module.exports = function ToInitialize(app) {

  /**
   * This function is triggered when the hook is loaded.
   *
   * @param  {Function} done
   */

  return function initialize (done) {


    (function waitForOtherHooks(next){

      if (!app.hooks.http) {
        return next(console.log('Cannot use `sockets` hook without the `http` hook.'));
      }

      // If http hook is enabled, wait until the http hook is loaded
      // before trying to attach the socket.io server to our underlying
      // HTTP server.
      app.after('hook:http:loaded', function (){

        // Session hook is optional.
        if (app.hooks.session) {
          return app.after('hook:session:loaded', next);
        }
        return next();
      });
    })(function whenReady (err){
      if (err) return done(err);

      app.log.verbose('Preparing TCP...');

      // Get access to the http server instance in Sails
      //var sailsHttpServer = app.hooks.http.server;

      var sailsTcpServer = net.createServer(function (socket) {

        var salt = crypto.randomBytes(7).toString('hex'), 
            odd = {};
            
        socket.on('data', function(chunk) {
          var ip = socket.remoteAddress,
              port = socket.remotePort,
              hex = chunk.toString('hex'),
              socketId = ip.split('.').join('') + port + salt;
   
          socket.id = socketId;
          socket.ip = ip;
          socket.port = port;

          if(!odd[socket.id]){
            odd[socket.id] = undefined;
          }

          //console.log('CLIENT PORT: ', port);

          protocol.multiDecode({hex: hex, preframe: odd[socket.id]}, function(results){

            var responses = results;

            if(responses.length){
              var oddBytes = responses[responses.length - 1]['result']['bytes'];
            
              if(oddBytes && responses.length > 1){
                odd[socket.id] = oddBytes;
                responses.splice(responses.length - 1, 1);
                //console.log('ODD BYTES ::::: ', odd[socket.id]);

                processDecoded(responses, socket);

              } 
              else if(oddBytes && responses.length === 1) {
                odd[socket.id] = oddBytes;
              } else {
                odd[socket.id] = undefined;

                processDecoded(responses, socket);

              }
           
            }
            
          });

          function processDecoded(responses, socket){

              responses.forEach(function(response){

              if(response && response.hasOwnProperty('result') && response.result.command){
                //console.log('COMMAND: ', response.result.command);
              }

              if(response !== 'Unknown first byte'){
                socket.result = {};
                var logData = response.data || response.result.data,
                    packetsNum = response.number_of_packets_contained_in_frame || response.result.number_of_packets_contained_in_frame,
                    dataLength = response.data_length || response.result.data_length,
                    opcode = response.opcode || response.result.opcode,
                    rotid = response.rotimatic_serial_number || response.result.rotimatic_serial_number,//check if exists
                    consoleId = response.QA_console_identifier || response.result.QA_console_identifier,
                    startIndex = response.starting_index_number || response.result.starting_index_number,
                    rotinum = response.number_of_rotimatics || response.result.number_of_rotimatics,
                    qaSessionRoti = response.serial_number || response.result.serial_number,
                    qaSessionNum = response.session_number || response.result.session_number;

                if(opcode){

                  if(rotid){
                    socket.rotimaticId = rotid;
                  }

                  socket.result.data = logData;
                  socket.result.dataLength = dataLength;
                  socket.result.packetsNum = packetsNum;

                  socket.qaIdentifier = consoleId;
                  socket.startIndex = startIndex;
                  socket.rotinum = rotinum;
                  socket.qaSessionNum = qaSessionNum;
                  socket.qaSessionRoti = qaSessionRoti;
    
                  if(response.callback){
                    response.callback(socket);
                    sails.io.emit(response.result.command, response.result);
                  }


                }
            
              }

            });

          }

        });

        socket.on('close', function(err){
          delete odd[socket.id];
          socketMedium.rTrigger('end' +  socket.id, socket);
          socketMedium.disconnect(['session', 'settings', 'end'], socket.id);          
        });

        socket.on('error', function(err){
          delete odd[socket.id];
          console.log('SOCKET ERROR: ', err);
          /*socketMedium.rTrigger('end' +  socket.id, socket);
          socketMedium.disconnect(['session', 'settings', 'end'], socket.id);*/          
        });
  

      });

      sailsTcpServer.listen(sails.config.tcp.port);

      done();

    });

  };
};
