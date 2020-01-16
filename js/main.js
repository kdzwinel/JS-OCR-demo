(function () {
    var video = document.querySelector('video');

    var pictureWidth = 640;
    var pictureHeight = 360;

    var fxCanvas = null;
    var texture = null;

    function checkRequirements() {
        var deferred = new $.Deferred();

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

        return deferred.promise();
    }

    function searchForRearCamera() {
        var deferred = new $.Deferred();

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

        return deferred.promise();
    }

    function setupVideo(rearCameraId) {
        var deferred = new $.Deferred();
        var videoSettings = {
            video: {
                // width: { min: pictureWidth },
                // height: { min: pictureHeight },
                facingMode: {
                    ideal: 'environment',
                },
            },
        };

        navigator.mediaDevices.getUserMedia(videoSettings)
            .then(function (stream) {
                //Setup the video stream
                video.srcObject = stream;

                video.addEventListener("loadedmetadata", function (e) {
                    //get video width and height as it might be different than we requested
                    pictureWidth = this.videoWidth;
                    pictureHeight = this.videoHeight;

                    if (!pictureWidth && !pictureHeight) {
                        //firefox fails to deliver info about video size on time (issue #926753), we have to wait
                        var waitingForSize = setInterval(function () {
                            if (video.videoWidth && video.videoHeight) {
                                pictureWidth = video.videoWidth;
                                pictureHeight = video.videoHeight;

                                clearInterval(waitingForSize);
                                deferred.resolve();
                            }
                        }, 100);
                    } else {
                        deferred.resolve();
                    }
                }, false);
            }).catch(function (error) {
                alert(String(error));
                console.log(error);
                deferred.reject('There is no access to your camera, have you denied it?');
            });

        return deferred.promise();
    }

    function step1() {
        checkRequirements()
            .then(searchForRearCamera)
            .then(setupVideo)
            .done(function () {
                //Enable the 'take picture' button
                $('#takePicture').removeAttr('disabled');
                //Hide the 'enable the camera' info
                $('#step1 figure').removeClass('not-ready');
            })
            .fail(function (error) {
                showError(error);
            });
    }

    function step2() {
        var canvas = document.querySelector('#step2 canvas');
        var img = document.querySelector('#step2 img');

        //setup canvas
        canvas.width = pictureWidth;
        canvas.height = pictureHeight;

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

    function step3() {
        var canvas = document.querySelector('#step3 canvas');
        // var step2Image = document.querySelector('#step2 img');
        // var cropData = $(step2Image).data().Jcrop.tellSelect();

        // var scale = step2Image.width / $(step2Image).width();

        //draw cropped image on the canvas
        // canvas.width = cropData.w * scale;
        // canvas.height = cropData.h * scale;
        var maxW=512;
        var maxH=512;

        var scale=Math.min((maxW/pictureWidth),(maxH/pictureHeight));
        var iwScaled=pictureWidth*scale;
        var ihScaled=pictureHeight*scale;
        canvas.width=iwScaled;
        canvas.height=ihScaled;

        console.log(canvas);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0); 
        sendPic(canvas);

        canvas.height = document.body.clientHeight - 330;
        ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0); 

        var spinner = $('.spinner');
        spinner.show();
        $('blockquote p').text('');
        $('blockquote footer').text('');

        // do the OCR!
        Tesseract.recognize(ctx).then(function (result) {
            var resultText = result.text ? result.text.trim() : '';

            //show the result
            spinner.hide();
            $('#result').html('&bdquo;' + resultText + '&ldquo;');
            $('blockquote footer').text('(' + resultText.length + ' characters)');
        });
    }

    function sendPic(canvas) {
      canvas.toBlob(function(obj) {
        const fData = new FormData();
        fData.append('image', obj);
        $.ajax({
          url: 'https://www.envivetw.com:8000/api/ocr/',
          type: 'POST',
          data: fData,
          enctype: 'multipart/form-data',
          processData: false,
          contentType: false,
          cache: false,
          success: ({ data }) => {
            if (data.hasOwnProperty('TextDetections')) {
              const texts = data.TextDetections.map((item) => item.DetectedText);
              console.log(texts);
              let target = '';
              let count = 0;
              for (let a = 0; a < texts.length ; a++){
                let element = texts[a];
                if (['高压', '收缩压'].indexOf(element) > -1) {
                  target = 'sp';
                } else if (['低压', '舒张压'].indexOf(element) > -1) {
                  target = 'dp'
                } else if (['心律', '脉搏'].indexOf(element) > -1) {
                  target = 'pulse';
                } else if (/\d/.test(element) && target != '') {
                  $("#" + target + " > .value").html(element);
                  target = '';
                  count++;
                  if (target == 'pulse') {
                    console.log('end');
                    break;
                  }
                }
              }
              if (count == 0) {
                showError('判断错误,请重新拍摄');
              }
            } else if (data.hasOwnProperty('errorMsg')) {
              showError(data.errorMsg);
            } else {
              showError('判断错误,请重新拍摄');
            }
            $('.spinner').hide();
          },
          error: function(xhr, status, error) {
            showError('连线错误');
            $('.spinner').hide();
            console.log(error);
          }
        });
      }, "image/jpeg", 1);
      
    }

    /*********************************
     * UI Stuff
     *********************************/

    //start step1 immediately
    step1();
    $('.help').popover();

    function changeStep(step) {
        if (step === 1) {
            video.play();
        } else {
            video.pause();
        }

        $('body').attr('class', 'step' + step);
        $('.nav li.active').removeClass('active');
        $('.nav li:eq(' + (step - 1) + ')').removeClass('disabled').addClass('active');
    }

    function showError(text) {
        $('.alert').show().find('span').text(text);
    }

    function hideError() {
        $('.alert').hide();
    }

    //handle brightness/contrast change
    $('#brightness, #contrast').on('change', function () {
        var brightness = $('#brightness').val() / 100;
        var contrast = $('#contrast').val() / 100;
        var img = document.querySelector('#step2 img');

        fxCanvas.draw(texture)
            .hueSaturation(-1, -1)
            .unsharpMask(20, 2)
            .brightnessContrast(brightness, contrast)
            .update();

        img.src = fxCanvas.toDataURL();

        //update crop tool (it creates copies of <img> that we have to update manually)
        $('.jcrop-holder img').attr('src', fxCanvas.toDataURL());
    });

    $('#takePicture').click(function () {
        // step2();
        changeStep(2);
        step3();
        changeStep(3);
    });

    $('#adjust').click(function () {
        step3();
        changeStep(3);
    });

    $('#go-back').click(function () {
        changeStep(2);
    });

    $('#start-over').click(function () {
        changeStep(1);
        hideError();
    });

    $('.nav').on('click', 'a', function () {
        if (!$(this).parent().is('.disabled')) {
            var step = $(this).data('step');
            changeStep(step);
        }

        return false;
    });
})();
