
'use strict';

/* Controllers */

angular.module('myApp.controllers', [])
  .controller('OcrCtrl', ['$scope', '$q', '$log', function($scope, $q, $log) {

    var video = document.querySelector('video');

  	$scope.settings = {
  		brightness: 0,
		contrast: 0,
		pictureWidth: 0,
		pictureHeight: 0
	}

	$scope.img = undefined;
	$scope.video = undefined;

	$scope.error = {
		context: undefined
	}

    //start step1 immediately
    $scope.init = function(){
	    $scope.step1();
	    $('.help').popover();    	
    }

    $scope.showError = function(text) {
    	$scope.error.context = text;
    }

    //handle brightness/contrast change
  	$scope.onChangePicture = function(){

        fxCanvas.draw(texture)
            .hueSaturation(-1, -1)
            .unsharpMask(20, 2)
            .brightnessContrast($scope.settings.brightness, $scope.settings.contrast)
            .update();

        img.src = fxCanvas.toDataURL();

        //update crop tool (it creates copies of <img> that we have to update manually)
        $('.jcrop-holder img').attr('src', fxCanvas.toDataURL());
  	}

	$scope.changeStep = function(step){
        if (step === 1) {
            video.play();
        } else {
            video.pause();
        }

        $('body').attr('class', 'step' + step);
        $('.nav li.active').removeClass('active');
        $('.nav li:eq(' + (step - 1) + ')').removeClass('disabled').addClass('active');
	}

	$scope.setupVideo = function(){
        var deferred = $q.defer();
        var getUserMedia = Modernizr.prefixed('getUserMedia', navigator);
        var videoSettings = {
            video: {
                optional: [
                    {
                        width: {min: $scope.settings.pictureWidth}
                    },
                    {
                        height: {min: $scope.settings.pictureHeight}
                    }
                ]
            }
        };

        //if rear camera is available - use it
        if (rearCameraId) {
            videoSettings.video.optional.push({
                sourceId: rearCameraId
            });
        }

        getUserMedia(videoSettings, function (stream) {
            //Setup the video stream
            video.src = window.URL.createObjectURL(stream);

            window.stream = stream;

            video.addEventListener("loadedmetadata", function (e) {
                //get video width and height as it might be different than we requested
                $scope.settings.pictureWidth = this.videoWidth;
                $scope.settings.pictureHeight = this.videoHeight;

                if (!$scope.settings.pictureWidth && !$scope.settings.pictureHeight) {
                    //firefox fails to deliver info about video size on time (issue #926753), we have to wait
                    var waitingForSize = setInterval(function () {
                        if (video.videoWidth && video.videoHeight) {
                            $scope.settings.pictureWidth = video.videoWidth;
                            $scope.settings.pictureHeight = video.videoHeight;

                            clearInterval(waitingForSize);
                            deferred.resolve();
                        }
                    }, 100);
                } else {
                    deferred.resolve();
                }
                $scope.$apply();
            }, false);
        }, function () {

            deferred.reject('There is no access to your camera, have you denied it?');
        });

        return deferred.promise;
	}

    $scope.checkRequirements = function() {
        var deferred = $q.defer();

        //Check if getUserMedia is available
        if (!Modernizr.getusermedia) {
            deferred.reject('Your browser doesn\'t support getUserMedia (according to Modernizr).');
        }

        //Check if WebGL is available
        if (Modernizr.webgl) {
            try {
                //setup glfx.js
                fxCanvas = fx.canvas();
            } catch (e) {
                deferred.reject('Sorry, glfx.js failed to initialize. WebGL issues?');
            }
        } else {
            deferred.reject('Your browser doesn\'t support WebGL (according to Modernizr).');
        }

        deferred.resolve();

        return deferred.promise;
    }

	$scope.searchForRearCamera = function(){
        var deferred = $q.defer();

        //MediaStreamTrack.getSources seams to be supported only by Chrome
        if (MediaStreamTrack && MediaStreamTrack.getSources) {
            MediaStreamTrack.getSources(function (sources) {
                var rearCameraIds = sources.filter(function (source) {
                    return (source.kind === 'video' && source.facing === 'environment');
                }).map(function (source) {
                    return source.id;
                });

                if (rearCameraIds.length) {
                    deferred.resolve(rearCameraIds[0]);
                } else {
                    deferred.resolve(null);
                }
            });
        } else {
            deferred.resolve(null);
        }

        return deferred.promise;		
	}

	$scope.step1 = function(){
        $scope.checkRequirements()
            .then($scope.searchForRearCamera)
            .then($scope.setupVideo)
            .then(function () {
                //Enable the 'take picture' button
                $('#takePicture').removeAttr('disabled');
                //Hide the 'enable the camera' info
                $('#step1 figure').removeClass('not-ready');
            })
            .catch(function (error) {
            	$log.info(error);
                $scope.showError(error);
            });
	}

	$scope.step2 = function(){
        var canvas = document.querySelector('#step2 canvas');
        var img = document.querySelector('#step2 img');

        //setup canvas
        canvas.width = $scope.settings.pictureWidth;
        canvas.height = $scope.settings.pictureHeight;

        var ctx = canvas.getContext('2d');

        //draw picture from video on canvas
        ctx.drawImage(video, 0, 0);

        //modify the picture using glfx.js filters
        texture = fxCanvas.texture(canvas);
        fxCanvas.draw(texture)
            .hueSaturation(-1, -1)//grayscale
            .unsharpMask(20, 2)
            .brightnessContrast(0.2, 0.9)
            .update();

        window.texture = texture;
        window.fxCanvas = fxCanvas;

        $(img)
            //setup the crop utility
            .one('load', function () {
                if (!$(img).data().Jcrop) {
                    $(img).Jcrop({
                        onSelect: function () {
                            //Enable the 'done' button
                            $('#adjust').removeAttr('disabled');
                        }
                    });
                } else {
                    //update crop tool (it creates copies of <img> that we have to update manually)
                    $('.jcrop-holder img').attr('src', fxCanvas.toDataURL());
                }
            })
            //show output from glfx.js
            .attr('src', fxCanvas.toDataURL());
	}

	$scope.step3 = function(){
        var canvas = document.querySelector('#step3 canvas');
        var step2Image = document.querySelector('#step2 img');
        var cropData = $(step2Image).data().Jcrop.tellSelect();

        var scale = step2Image.width / $(step2Image).width();

        //draw cropped image on the canvas
        canvas.width = cropData.w * scale;
        canvas.height = cropData.h * scale;

        var ctx = canvas.getContext('2d');
        ctx.drawImage(
            step2Image,
            cropData.x * scale,
            cropData.y * scale,
            cropData.w * scale,
            cropData.h * scale,
            0,
            0,
            cropData.w * scale,
            cropData.h * scale);

        //use ocrad.js to extract text from the canvas
        var resultText = OCRAD(ctx);
        resultText = resultText.trim();

        //show the result
        $('blockquote p').html('&bdquo;' + resultText + '&ldquo;');
        $('blockquote footer').text('(' + resultText.length + ' characters)')
	}

  }]);
