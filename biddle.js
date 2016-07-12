/*global */
/*jshint laxbreak: true*/
/*jslint node: true*/
(function biddle() {
    "use strict";
    var child = require("child_process").exec,
        path  = require("path"),
        fs    = require("fs"),
        http  = require("http"),
        https = require("https"),
        input = (function () {
            var a = process.argv;
            a.splice(0, 1);
            if (a[0].indexOf("biddle") > 0) {
                a.splice(0, 1);
            }
            a[0] = a[0].toLowerCase();
            return a;
        }()),
        commas  = function biddle_commas(number) {
            var str = String(number),
                arr = [],
                a   = str.length;
            if (a < 4) {
                return str;
            }
            arr = String(number).split("");
            a   = arr.length;
            do {
                a -= 3;
                arr[a] = "," + arr[a];
            } while (a > 3);
            return arr.join("");
        },
        command = input[0].toLowerCase(),
        writeFile = function biddle_writeFile(fileData) {
            var paths = input[1].split("/"),
                name  = paths[paths.length - 1];
            fs.writeFile(name, fileData, function biddle_writeFile_callback(err) {
                if (err !== null && err !== null) {
                    return console.log(err);
                }
                if (command === "get") {
                    console.log("File " + name + " written at " + commas(fileData.length) + " bytes.");
                }
            });
        },
        install = function biddle_install() {
            //get();
        },
        get = function biddle_get(install) {
            var a = (typeof input[1] === "string")
                    ? input[1].indexOf("s://")
                    : 0,
                file = "",
                callback = function biddle_get_callback(res) {
                    res.setEncoding("utf8");
                    res.on("data", function biddle_get_callback_data(chunk) {
                        file += chunk;
                    });
                    res.on("end", function biddle_get_callback_end() {
                        if (install === true) {
                            install();
                        } else {
                            writeFile(file);
                        }
                    });
                    res.on("error", function biddle_get_callback_error(error) {
                        console.log("Error downloading file via HTTP:");
                        console.log("");
                        console.log(error);
                    });
                };
            if (a > 0 && a < 10) {
                https.get(input[1], callback);
            } else {
                http.get(input[1], callback);
            }
        };
    if (command === "get") {
        get(false);
    } else if (command === "install") {
        get(true);
    }
}());
