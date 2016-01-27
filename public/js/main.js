define(["app", "marionette", "backbone", "jquery"],
    function (app, Marionette, Backbone, $) {

        app.on("user-info-render", function (context) {
            context.result = "<li id='licenseInformationHolder'></li>" + context.result;
        });

        app.onStartListeners.add(function(cb) {
            cb();

            if (app.settings.data.license && app.settings.data.license.value) {
                $('#licenseInformationHolder').html("<a target='_blank' class='btn-info' style='padding-right:22px' href='http://jsreport.net/buy'>ENTERPRISE LICENSE</a>")
                return;
            }

            setTimeout(function () {

                $.getJSON("odata/templates/$count", function(data) {
                    if (data.value > 5) {
                        $('#licenseInformationHolder').html("<a target='_blank' style='padding-right:22px' class='btn-warning' href='http://jsreport.net/buy'>UNLICENSED / BUY</a>")
                        $.dialog({
                            hideSubmit: true,
                            header: "<span class='text text-danger'>Free license exceeded</span>",
                            content: "<p>Free license is limited to maximum 5 templates. Please buy the enterprise license before you continue.</p>" +
                            "<p>The instructions for buying enterprise license can be found <a href='http://jsreport.net/buy' target='_blank'>here</a>.</p>"
                        });
                    } else {
                        $('#licenseInformationHolder').html("<a target='_blank' style='padding-right:22px' class='btn-success' href='http://jsreport.net/buy'>FREE LICENSE</a>")
                    }
                });
            }, 1000);
        });
    });
