/*jshint laxbreak: true*/
/*jslint node: true, for: true*/
(function biddle() {
    "use strict";
    var node = {
            child: require("child_process").exec,
            fs   : require("fs"),
            http : require("http"),
            https: require("https"),
            path : require("path")
        },
        data = {},
        apps = {};
    data.abspath     = "";
    data.address     = {};
    data.abspath     = "";
    data.childtest   = false;
    data.command     = "";
    data.cwd         = process.cwd();
    data.filename    = "";
    data.hashFile    = "";
    data.hashZip     = "";
    data.ignore      = [];
    data.input       = [];
    data.installed   = {};
    data.packjson    = {};
    data.platform    = process
        .platform
        .replace(/\s+/g, "")
        .toLowerCase();
    data.published   = {};
    apps.commas      = function biddle_commas(number) {
        var str = String(number),
            arr = [],
            a   = str.length;
        if (a < 4) {
            return str;
        }
        arr = String(number).split("");
        a   = arr.length;
        do {
            a      -= 3;
            arr[a] = "," + arr[a];
        } while (a > 3);
        return arr.join("");
    };
    apps.errout      = function biddle_errout(errData) {
        var error = (typeof errData.error !== "string" || errData.error.toString().indexOf("Error: ") === 0)
                ? errData
                    .error
                    .toString()
                    .replace("Error: ", "\u001b[1m\u001b[31mError:\u001b[39m\u001b[0m ")
                : "\u001b[1m\u001b[31mError:\u001b[39m\u001b[0m " + errData
                    .error
                    .toString(),
            stack = new Error().stack;
        if (data.platform === "win32") {
            stack = stack.replace("Error", "Stack trace\r\n-----------");
        } else {
            stack = stack.replace("Error", "Stack trace\n-----------");
        }
        error = error
            .toString()
            .replace(/(\s+)$/, "");
        if (data.command === "test") {
            process.chdir(data.cwd);
            if (errData.name.indexOf("biddle_test_publish") === 0 || errData.name.indexOf("biddle_test_install") === 0) {
                data.input[2] = "biddletesta";
                apps.unpublish();
            }
            apps
                .rmrecurse(data.abspath + "unittest", function biddle_errout_dataClean() {
                    apps
                        .rmrecurse(data.abspath + "temp", function biddle_errout_dataClean_tempTestClean() {
                            console.log("\u001b[31mUnit test failure.\u001b[39m");
                            if (errData.stdout !== undefined) {
                                console.log(errData.stdout);
                            }
                            console.log("\u001b[1m\u001b[36mFunction:\u001b[39m\u001b[0m " + errData.name);
                            console.log(error);
                            console.log("");
                            console.log(stack);
                            console.log("");
                            console.log(errData.time);
                            process.exit(1);
                        });
                });
        } else {
            apps
                .rmrecurse(data.abspath + "temp", function biddle_errout_dataClean_tempNontestClean() {
                    console.log("\u001b[1m\u001b[36mFunction:\u001b[39m\u001b[0m " + errData.name);
                    console.log(error);
                    if (data.childtest === false) {
                        console.log("");
                        console.log(stack);
                    }
                    process.exit(1);
                });
        }
    };
    apps.get         = function biddle_get(url, callback) {
        var a       = (typeof url === "string")
                ? url.indexOf("s://")
                : 0,
            file    = "",
            hashy   = (data.command === "install" && data.fileName.indexOf(".hash") < 0),
            addy    = (hashy === true)
                ? data.address.downloads
                : data.address.target,
            getcall = function biddle_get_getcall(res) {
                res.setEncoding("utf8");
                res.on("data", function biddle_get_getcall_data(chunk) {
                    file += chunk;
                });
                res.on("end", function biddle_get_getcall_end() {
                    if (res.statusCode !== 200) {
                        console.log(res.statusCode + " " + node.http.STATUS_CODES[res.statusCode] + ", for request " + url);
                        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location !== undefined) {
                            data.input[2] = res.headers.location;
                            data.fileName = apps.getFileName();
                            biddle_get(res.headers.location, callback);
                        }
                    } else {
                        apps
                            .makedir(addy, function biddle_get_getcall_end_complete() {
                                callback(file);
                            });
                    }
                });
                res.on("error", function biddle_get_getcall_error(error) {
                    return apps.errout({error: error, name: "biddle_get_getcall_error"});
                });
            };
        if ((/^(https?:\/\/)/).test(url) === false) {
            if ((/(\.zip)$/).test(url) === true) {
                console.log("Address " + url + " is missing the \u001b[36mhttp(s)\u001b[39m scheme, treating as a local path...");
                apps.makedir(addy, function biddle_get_localFile() {
                    apps.readBinary(url, callback);
                });
            } else {
                callback();
            }
        } else if (a > 0 && a < 10) {
            node
                .https
                .get(url, getcall);
        } else {
            node
                .http
                .get(url, getcall);
        }
    };
    apps.getFileName = function biddle_getFileName() {
        var paths  = [],
            output = "";
        if (data.input[2] === undefined) {
            return "download.xxx";
        }
        if (data.command === "get") {
            paths = data
                .input[2]
                .split("/");
        } else {
            paths = data
                .input[2]
                .split(node.path.sep);
        }
        if (paths[paths.length - 1].length > 0) {
            output = paths[paths.length - 1].toLowerCase();
        } else {
            do {
                paths.pop();
            } while (paths.length > 0 && paths[paths.length - 1] === "");
            if (paths.length < 1) {
                return "download.xxx";
            }
            output = paths[paths.length - 1].toLowerCase();
        }
        return apps.sanitizef(output.replace(/\+|<|>|:|"|\/|\\|\||\?|\*|%/g, ""));
    };
    apps.getpjson    = function biddle_getpjson(callback) {
        var file = data
            .input[2]
            .replace(/(\/|\\)$/, "") + node.path.sep + "package.json";
        node
            .fs
            .readFile(file, "utf8", function biddle_getpjson_readfile(err, fileData) {
                if (err !== null && err !== undefined) {
                    if (err.toString().indexOf("no such file or directory") > 0) {
                        return apps.errout({
                            error: "The package.json file is missing from " + data.input[2] + ". biddle cannot publish without a package.json file. Perhaps " + apps.relToAbs(data.input[2], false) + " is the incorrect location.",
                            name : "biddle_getpjson_readFile"
                        });
                    }
                    return apps.errout({error: err, name: "biddle_getpjson_readFile"});
                }
                data.packjson = JSON.parse(fileData);
                if (data.packjson.name === undefined) {
                    return apps.errout({error: "The package.json file is missing the required \u001b[31mname\u001b[39m property.", name: "biddle_getpjson_readfile"});
                }
                if (data.packjson.version === undefined) {
                    return apps.errout({
                        error: "The package.json file is missing the required \u001b[31mversion\u001b[39m proper" +
                                  "ty.",
                        name : "biddle_getpjson_readfile"
                    });
                }
                if (typeof data.packjson.name !== "string") {
                    if (typeof data.packjson.name === "object" && data.packjson.name !== null) {
                        data.packjson.name = JSON.stringify(data.packjson.name);
                    } else {
                        data.packjson.name = String(data.packjson.name);
                    }
                }
                if (typeof data.packjson.version !== "string") {
                    if (typeof data.packjson.version === "object" && data.packjson.version !== null) {
                        data.packjson.version = JSON.stringify(data.packjson.version);
                    } else {
                        data.packjson.version = String(data.packjson.version);
                    }
                }
                callback();
            });
    };
    apps.hashCmd     = function biddle_hashCmd(filepath, store, callback) {
        var cmd = "";
        if (data.platform === "darwin") {
            cmd = "shasum -a 512 " + filepath;
        } else if (data.platform === "win32") {
            cmd = "certUtil -hashfile " + filepath + " SHA512";
        } else {
            cmd = "sha512sum " + filepath;
        }
        node
            .fs
            .stat(filepath, function biddle_hashCmd_stat(er, stat) {
                if (er !== null) {
                    if (er.toString().indexOf("no such file or directory") > 0) {
                        if (data.command === "install") {
                            return apps.errout({
                                error: filepath + " \u001b[31mdoes not appear to be a zip file\u001b[39m. Install command expects t" +
                                        "o receive a zip file and a hash file at the same location and file name.",
                                name : "biddle_hashCmd_stat"
                            });
                        }
                        return apps.errout({
                            error: "filepath " + filepath + " is not a file.",
                            name : "biddle_hashCmd_stat"
                        });
                    }
                    return apps.errout({error: er, name: "biddle_hashCmd_stat"});
                }
                if (stat === undefined || stat.isFile() === false) {
                    if (data.command === "install") {
                        return apps.errout({
                            error: filepath + " \u001b[31mdoes not appear to be a zip file\u001b[39m. Install command expects t" +
                                    "o receive a zip file and a hash file at the same location and file name.",
                            name : "biddle_hashCmd_stat"
                        });
                    }
                    return apps.errout({
                        error: "filepath " + filepath + " is not a file.",
                        name : "biddle_hashCmd_stat"
                    });
                }
                node
                    .child(cmd, function biddle_hashCmd_stat_exec(err, stdout, stderr) {
                        if (err !== null) {
                            return apps.errout({error: err, name: "biddle_hashCmd_stat_exec"});
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                            return apps.errout({error: stderr, name: "biddle_hashCmd_stat_exec"});
                        }
                        stdout      = stdout.replace(/\s+/g, "");
                        stdout      = stdout.replace(filepath, "");
                        stdout      = stdout.replace("SHA512hashoffile:", "");
                        stdout      = stdout.replace("CertUtil:-hashfilecommandcompletedsuccessfully.", "");
                        data[store] = stdout;
                        callback(stdout);
                    });
            });
    };
    apps.help        = function biddle_help() {
        var file = data.abspath + "readme.md",
            size = data.input[2];
        if (data.command === "markdown") {
            file = data.input[2];
            size = data.input[3];
        }
        node
            .fs
            .readFile(file, "utf8", function biddle_help_readme(err, readme) {
                var lines  = [],
                    listly = [],
                    output = [],
                    ind    = "",
                    listr  = "",
                    b      = 0,
                    len    = 0,
                    ens    = "\u001b[0m", //end - text formatting
                    bld    = "\u001b[1m", //text formatting - bold
                    itl    = "\u001b[3m", //text formatting - italics
                    und    = "\u001b[4m", //underline
                    enu    = "\u001b[24m", //end - underline
                    red    = "\u001b[31m", //color - red
                    grn    = "\u001b[32m", //color - green
                    tan    = "\u001b[33m", //color - tan
                    cyn    = "\u001b[36m", //color - cyan
                    enc    = "\u001b[39m", //end - color
                    parse  = function biddle_help_readme_parse(listitem) {
                        var chars = lines[b]
                                .replace(/`/g, "bix~")
                                .split(""),
                            final = chars.length,
                            s     = (/\s/),
                            x     = 0,
                            y     = ind.length,
                            start = 0,
                            index = 0,
                            math  = 0,
                            endln = 0,
                            quote = "",
                            wrap  = function biddle_help_readme_parse_wrap() {
                                var z      = x,
                                    format = function biddle_help_readme_parse_wrap_format(eol) {
                                        chars[eol] = "\n" + ind;
                                        index      = 1 + y + eol;
                                        if (chars[eol - 1] === " ") {
                                            chars[eol - 1] = "";
                                        } else if (chars[eol + 1] === " ") {
                                            chars.splice(eol + 1, 1);
                                            final -= 1;
                                        }
                                    };
                                if (s.test(chars[x]) === true) {
                                    format(x);
                                } else {
                                    do {
                                        z -= 1;
                                    } while (s.test(chars[z]) === false && z > index);
                                    if (z > index) {
                                        format(z);
                                    }
                                }
                            };
                        if ((/\u0020{4}\S/).test(lines[b]) === true && listitem === false) {
                            lines[b] = grn + lines[b] + enc;
                            return;
                        }
                        chars.splice(0, 0, ind);
                        if (listitem === true) {
                            x = listly.length;
                            do {
                                x   -= 1;
                                y   += 2;
                                ind = ind + "  ";
                            } while (x > 0);
                        }
                        start = y - 1;
                        endln = (isNaN(size) === false && size !== "")
                            ? Number(size) - y
                            : 100 - y;
                        for (x = start; x < final; x += 1) {
                            math = ((x + y) - (index - 1)) / endln;
                            if (quote === "") {
                                if (chars[x] === "*" && chars[x + 1] === "*") {
                                    quote = "**";
                                    chars.splice(x, 2);
                                    chars[x] = bld + chars[x];
                                    final    -= 2;
                                } else if (chars[x] === "*" && ((x === start && chars[x + 1] !== " ") || x > start)) {
                                    quote = "*";
                                    chars.splice(x, 1);
                                    chars[x] = itl + tan + chars[x];
                                    final    -= 1;
                                } else if (chars[x] === "b" && chars[x + 1] === "i" && chars[x + 2] === "x" && chars[x + 3] === "~") {
                                    quote = "`";
                                    chars.splice(x, 4);
                                    chars[x] = grn + chars[x];
                                    final    -= 4;
                                } else if (chars[x - 2] === "," && chars[x - 1] === " " && chars[x] === "(") {
                                    quote    = ")";
                                    chars[x] = chars[x] + cyn;
                                }
                            } else if (chars[x] === "b" && chars[x + 1] === "i" && chars[x + 2] === "x" && chars[x + 3] === "~" && quote === "`") {
                                quote = "";
                                chars.splice(x, 4);
                                chars[x] = chars[x] + enc;
                                final    -= 4;
                                if (math > 1 && chars[x + 1] === " ") {
                                    x += 1;
                                    wrap();
                                }
                            } else if (chars[x] === ")" && quote === ")") {
                                quote    = "";
                                chars[x] = enc + chars[x];
                                if (math > 1 && chars[x + 1] === " ") {
                                    x += 1;
                                    wrap();
                                }
                            } else if (chars[x] === "*" && chars[x + 1] === "*" && quote === "**") {
                                quote = "";
                                chars.splice(x, 2);
                                chars[x - 1] = chars[x - 1] + ens;
                                final        -= 2;
                            } else if (chars[x] === "*" && quote === "*") {
                                quote = "";
                                chars.splice(x, 1);
                                chars[x - 1] = chars[x - 1] + enc + ens;
                                final        -= 1;
                            }
                            if (math > 1 && quote !== "`") {
                                wrap();
                            }
                        }
                        if (quote === "**") {
                            chars.pop();
                            chars[x - 1] = chars[x - 1] + ens;
                        } else if (quote === "*") {
                            chars.pop();
                            chars[x - 1] = chars[x - 1] + enc + ens;
                        } else if (quote === ")") {
                            chars[x - 1] = chars[x - 1] + enc;
                        } else if (quote === "`") {
                            chars.pop();
                            chars[x - 4] = chars[x - 4] + enc;
                            chars[x - 3] = "";
                            chars[x - 2] = "";
                            chars[x - 1] = "";
                            chars[x]     = "";
                        }
                        lines[b] = chars.join("");
                        if (listitem === true) {
                            ind = ind.slice(listly.length * 2);
                        }
                    };
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_help_readme"});
                }
                readme = (function biddle_help_readme_removeImages() {
                    var readout = [],
                        j       = readme.split(""),
                        i       = 0,
                        ilen    = j.length,
                        brace   = "";
                    for (i = 0; i < ilen; i += 1) {
                        if (brace === "") {
                            if (j[i] === "\r") {
                                if (j[i + 1] === "\n") {
                                    j[i] = "";
                                } else {
                                    j[i] = "\n";
                                }
                            } else if (j[i] === "!" && j[i + 1] === "[") {
                                brace    = "]";
                                j[i]     = "";
                                j[i + 1] = "";
                            } else if (j[i] === "]" && j[i + 1] === "(") {
                                j[i] = ", ";
                            } else if (j[i] === "[") {
                                j[i] = "";
                            } else if (j[i] === ")" && j[i + 1] === " " && (/\s/).test(j[i + 2]) === false) {
                                j[i] = "),";
                            }
                        } else if (brace === j[i]) {
                            j[i] = "";
                            if (brace === "]" && j[i + 1] === "(") {
                                brace = ")";
                            } else {
                                brace = "";
                            }
                        }
                        if (brace !== ")") {
                            readout.push(j[i]);
                        }
                    }
                    return readout.join("");
                }());
                lines  = readme.split("\n");
                len    = lines.length;
                output.push("");
                for (b = 0; b < len; b += 1) {
                    if (lines[b].indexOf("#### ") === 0) {
                        listly   = [];
                        ind      = "    ";
                        lines[b] = ind + und + bld + tan + lines[b].slice(5) + enc + ens + enu;
                        ind      = "      ";
                    } else if (lines[b].indexOf("### ") === 0) {
                        listly   = [];
                        ind      = "  ";
                        lines[b] = ind + und + bld + grn + lines[b].slice(4) + enc + ens + enu;
                        ind      = "    ";
                    } else if (lines[b].indexOf("## ") === 0) {
                        listly   = [];
                        ind      = "  ";
                        lines[b] = und + bld + cyn + lines[b].slice(3) + enc + ens + enu;
                    } else if (lines[b].indexOf("# ") === 0) {
                        listly   = [];
                        ind      = "";
                        lines[b] = und + bld + red + lines[b].slice(2) + enc + ens + enu;
                    } else if ((/^(\s*\*\s)/).test(lines[b]) === true) {
                        listr = (/^(\s*\*\s)/).exec(lines[b])[0];
                        if (listly.length === 0 || (listly[listly.length - 1] !== listr && listly[listly.length - 2] !== listr)) {
                            if ((/\s/).test(listr.charAt(0)) === true) {
                                listly.push(listr);
                            } else {
                                listly = [listr];
                            }
                        }
                        parse(true);
                        lines[b] = lines[b].replace("*", bld + red + "*" + enc + ens);
                    } else if ((/^(\s*-\s)/).test(lines[b]) === true) {
                        listr = (/^(\s*-\s)/).exec(lines[b])[0];
                        if (listly.length === 0 || (listly[listly.length - 1] !== listr && listly[listly.length - 2] !== listr)) {
                            if ((/\s/).test(listr.charAt(0)) === true) {
                                listly.push(listr);
                            } else {
                                listly = [listr];
                            }
                        }
                        parse(true);
                        lines[b] = lines[b].replace("-", bld + red + "-" + enc + ens);
                    } else {
                        listly = [];
                        if (lines[b].length > 0) {
                            parse(false);
                        }
                    }
                    output.push(lines[b]);
                }
                if (data.platform === "win32") {
                    ind = output.join("\r\n");
                } else {
                    ind = output.join("\n");
                }
                if ((data.command === "help" && data.input[3] === "test") || (data.command === "markdown" && data.input[4] === "test")) {
                    ind = ind
                        .replace(/\r\n/g, "\n")
                        .slice(0, 8192)
                        .replace(/(\\(\w+)?)$/, "")
                        .replace(/\\(?!(\\))/g, "\\\\")
                        .replace(/\u001b/g, "\\u001b")
                        .replace(/\n/g, "\\n")
                        .replace(/"/g, "\\\"")
                        .replace(/\\\\"/g, "\\\"");
                }
                console.log(ind);
                process.exit(0);
            });
    };
    apps.install     = function biddle_install() {
        var flag        = {
                hash: false,
                zip : false
            },
            compareHash = function biddle_install_compareHash() {
                apps
                    .hashCmd(data.address.downloads + data.fileName, "hashZip", function biddle_install_compareHash_hashCmd() {
                        if (data.hashFile === data.hashZip) {
                            apps
                                .zip(function biddle_install_callback() {
                                    var status   = {
                                            packjson: false,
                                            remove  : false
                                        },
                                        complete = function biddle_install_compareHash_hashCmd_complete() {
                                            console.log("Application " + data.packjson.name + " is installed to version: " + data.packjson.version);
                                        };
                                    apps.rmrecurse("downloads" + node.path.sep + data.fileName, function biddle_install_compareHash_hashCmd_remove() {
                                        status.remove = true;
                                        if (status.packjson === true) {
                                            complete();
                                        }
                                    }, {
                                        location: apps.relToAbs(data.input[2]),
                                        name    : ""
                                    });
                                });
                        } else {
                            console.log("\u001b[31mHashes don't match\u001b[39m for " + data.input[2] + ". File is saved in the downloads directory and will not be installed.");
                        }
                    });
            };
        apps.get(data.input[2], function biddle_install_getzip(fileData) {
            flag.zip = true;
            if (flag.hash === true) {
                compareHash(fileData);
            }
        });
        apps.get(data.input[2].replace(".zip", ".hash"), function biddle_install_gethash(fileData) {
            flag.hash = true;
            if (flag.zip === true) {
                compareHash(fileData);
            }
        });
    };
    apps.list        = function biddle_list() {
        var listtype = {
                installed: Object.keys(data.installed),
                published: Object.keys(data.published)
            },
            dolist   = function biddle_list_dolist(type) {
                var len = 0,
                    a   = 0;
                if (listtype[type].length === 0) {
                    console.log("\u001b[4mInstalled applications:\u001b[0m");
                    console.log("");
                    console.log("No applications are installed by biddle.");
                    console.log("");
                } else {
                    console.log("\u001b[4mInstalled applications:\u001b[0m");
                    console.log("");
                    len = listtype[type].length;
                    do {
                        console.log(listtype[type][a] + " - " + data[type][listtype[type][a]].latest + " - " + data[type][listtype[type][a]].directory);
                        a += 1;
                    } while (a < len);
                }
            };
        if (data.input[2] !== "installed" && data.input[2] !== "published" && data.input[2] !== undefined) {
            data.input[2] = "both";
        }
        if (data.input[2] === "installed" || data.input[2] === "both" || data.input[2] === undefined) {
            dolist("installed");
        }
        if (data.input[2] === "published" || data.input[2] === "both" || data.input[2] === undefined) {
            dolist("published");
        }
    };
    apps.makedir     = function biddle_makedir(dirToMake, callback) {
        node
            .fs
            .stat(dirToMake, function biddle_makedir_stat(err, stats) {
                var dirs   = [],
                    ind    = 0,
                    len    = 0,
                    restat = function biddle_makedir_stat_restat() {
                        node
                            .fs
                            .stat(dirs.slice(0, ind + 1).join(node.path.sep), function biddle_makedir_stat_restat_callback(erra, stata) {
                                ind += 1;
                                if ((erra !== null && erra.toString().indexOf("no such file or directory") > 0) || (typeof erra === "object" && erra !== null && erra.code === "ENOENT")) {
                                    return node
                                        .fs
                                        .mkdir(dirs.slice(0, ind).join(node.path.sep), function biddle_makedir_stat_restat_callback_mkdir(errb) {
                                            if (errb !== null && errb.toString().indexOf("file already exists") < 0) {
                                                return apps.errout({error: errb, name: "biddle_makedir_stat_restat_callback_mkdir"});
                                            }
                                            if (ind < len) {
                                                biddle_makedir_stat_restat();
                                            } else {
                                                callback();
                                            }
                                        });
                                }
                                if (erra !== null && erra.toString().indexOf("file already exists") < 0) {
                                    return apps.errout({error: erra, name: "biddle_makedir_stat_restat_callback"});
                                }
                                if (stata.isFile() === true) {
                                    return apps.errout({
                                        error: "Destination directory, '" + dirToMake + "', is a file.",
                                        name : "biddle_makedir_stat_restat_callback"
                                    });
                                }
                                if (ind < len) {
                                    biddle_makedir_stat_restat();
                                } else {
                                    callback();
                                }
                            });
                    };
                if ((err !== null && err.toString().indexOf("no such file or directory") > 0) || (typeof err === "object" && err !== null && err.code === "ENOENT")) {
                    dirs = dirToMake.split(node.path.sep);
                    if (dirs[0] === "") {
                        ind += 1;
                    }
                    len = dirs.length;
                    return restat();
                }
                if (err !== null && err.toString().indexOf("file already exists") < 0) {
                    return apps.errout({error: err, name: "biddle_makedir_stat"});
                }
                if (stats.isFile() === true) {
                    return apps.errout({
                        error: "Destination directory, '" + dirToMake + "', is a file.",
                        name : "biddle_makedir_stat"
                    });
                }
                callback();
            });
    };
    apps.makeGlobal  = function biddle_makeGlobal() {
        if (data.platform === "win32") {
            return node.child("powershell.exe -nologo -noprofile -command \"[Environment]::GetEnvironmentVariab" +
                    "le('PATH','Machine');\"",
                    function biddle_makeGlobal_winRead(er, stdout, stder) {
                var remove = "";
                if (er !== null) {
                    return apps.errout({error: er, name: "biddle_makeGlobal_winRead"});
                }
                if (stder !== null && stder !== "") {
                    return apps.errout({error: stder, name: "biddle_makeGlobal_winRead"});
                }
                if (stdout.indexOf(data.abspath) > -1) {
                    if (data.input[2] === "remove") {
                        remove = stdout
                            .replace(";" + data.abspath + "cmd", "")
                            .replace(/(\s+)$/, "");
                        return node.child("powershell.exe -nologo -noprofile -command \"$PATH='" + remove + "';[Environment]::SetEnvironmentVariable('PATH',$PATH,'Machine');\"", function biddle_makeGlobal_winRead_winRemovePath(erw, stdoutw, stderw) {
                            if (erw !== null) {
                                return apps.errout({error: erw, name: "biddle_makeGlobal_winRead_winRemovePath"});
                            }
                            if (stderw !== null && stderw !== "") {
                                return apps.errout({error: stderw, name: "biddle_makeGlobal_winRead_winRemovePath"});
                            }
                            console.log(data.abspath + "cmd removed from %PATH%.");
                            apps.rmrecurse(data.abspath + "cmd", function biddle_makeGlobal_winRead_winRemovePath_winRemoveBin() {
                                console.log(data.abspath + "cmd deleted.");
                            });
                            return stdoutw;
                        });
                    }
                    return apps.errout({
                        error: data.abspath + "cmd is already in %PATH%",
                        name : "biddle_makeGlobal_winRead"
                    });
                }
                if (data.input[2] === "remove") {
                    return apps.errout({
                        error: data.abspath + "cmd is not present in %PATH%",
                        name : "biddle_makeGlobal_winRead"
                    });
                }
                node
                    .child("powershell.exe -nologo -noprofile -command \"$PATH=[Environment]::GetEnvironment" +
                            "Variable('PATH');[Environment]::SetEnvironmentVariable('PATH',$PATH';" + data.abspath + "cmd','Machine');\"", function biddle_makeGlobal_winRead_winWritePath(erw, stdoutw, stderw) {
                        if (erw !== null) {
                            return apps.errout({error: erw, name: "biddle_makeGlobal_winRead_winWritePath"});
                        }
                        if (stderw !== null && stderw !== "") {
                            return apps.errout({error: stderw, name: "biddle_makeGlobal_winRead_winWritePath"});
                        }
                        console.log(data.abspath + "cmd added to %PATH% and immediately avialable.");
                        apps.makedir(data.abspath + "cmd", function biddle_makeGlobal_winRead_winWritePath_winMakeDir() {
                            var cmd = "@IF EXIST \"%~dp0\\node.exe\" (\r\n  \"%~dp0\\node.exe\" \"" + data.abspath + "bin\\biddle\" %*\r\n) ELSE (\r\n  node \"" + data.abspath + "bin\\biddle\" %*\r\n)";
                            apps.writeFile(cmd, data.abspath + "cmd\\biddle.cmd", function biddle_makeGlobal_winRead_winWritePath_winMakeDir_winWriteCmd() {
                                console.log(data.abspath + "cmd\\biddle.cmd written. Please restart your terminal.");
                            });
                        });
                        return stdoutw;
                    });
            });
        }
        node
            .fs
            .readFile("/etc/paths", "utf8", function biddle_makeGlobal_nixRead(err, filedata) {
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_makeGlobal_nixRead"});
                }
                if (filedata.indexOf(data.abspath + "bin") > -1) {
                    if (data.input[2] === "remove") {
                        return apps.writeFile(filedata.replace("\n" + data.abspath + "bin", ""), "/etc/paths", function biddle_makeGlobal_nixRead_nixRemove() {
                            console.log(data.abspath + "bin removed from $PATH.  Please restart your terminal.");
                        });
                    }
                    return apps.errout({
                        error: data.abspath + "bin is already in $PATH",
                        name : "biddle_makeGlobal_nixRead"
                    });
                }
                if (data.input[2] === "remove") {
                    return apps.errout({
                        error: data.abspath + "bin is not present in $PATH",
                        name : "biddle_makeGlobal_nixRead"
                    });
                }
                apps
                    .writeFile(filedata + data.abspath + "bin\n", "/etc/paths", function biddle_makeGlobal_nixRead_nixWrite() {
                        console.log(data.abspath + "bin added to $PATH.  Please restart your terminal");
                    });
            });
    };
    apps.publish     = function biddle_publish() {
        var flag      = {
                finalish: false,
                getpjson: false,
                ignore  : false
            },
            zippy     = function biddle_publish_zippy(vardata) {
                apps
                    .zip(function biddle_publish_zippy_zip(zipfilename, writejson) {
                        apps
                            .hashCmd(zipfilename, "hashFile", function biddle_publish_zippy_zip_hash() {
                                apps
                                    .writeFile(data.hashFile, zipfilename.replace(".zip", ".hash"), function biddle_publish_zippy_zip_hash_writehash() {
                                        return true;
                                    });
                                if (writejson === true && vardata.final === true) {
                                    data
                                        .published[data.packjson.name]
                                        .versions
                                        .push(data.packjson.version);
                                    apps.writeFile(JSON.stringify(data.published), data.abspath + "published.json", function biddle_publish_zippy_zip_hash_writeJSON() {
                                        apps
                                            .rmrecurse(data.abspath + "temp", function biddle_publish_zippy_zip_hash_writeJSON_removeTemp() {
                                                return true;
                                            });
                                    });
                                }
                            });
                    }, vardata);
            },
            execution = function biddle_publish_execution() {
                var vflag    = 0,
                    variants = Object.keys(data.packjson.publication_variants);
                variants.push("");
                if (data.published[data.packjson.name] !== undefined && data.published[data.packjson.name].versions.indexOf(data.packjson.version) > -1) {
                    return apps.errout({
                        error: "Attempted to publish " + data.packjson.name + " over existing version " + data.packjson.version,
                        name : "biddle_publish_execution"
                    });
                }
                apps
                    .makedir("temp", function biddle_publish_execution_variantDir() {
                        variants
                            .forEach(function biddle_publish_execution_variantsDir_each(value) {
                                var cmd    = "",
                                    varobj = (value === "")
                                        ? {}
                                        : data.packjson.publication_variants[value];
                                value = apps.sanitizef(value);
                                cmd   = (data.platform === "win32")
                                    ? "xcopy /E /Q /G /H /Y /J /I " + data.input[2] + " " + data.abspath + "temp" + node.path.sep + value
                                    : "cp -R " + data.input[2] + " " + data.abspath + "temp" + node.path.sep + value;
                                node.child(cmd, function biddle_publish_execution_variantsDir_each_copy(er, stdout, stder) {
                                    var complete   = function biddle_publish_execution_variantsDir_each_copy_complete() {
                                            var location = (value === "")
                                                    ? apps.relToAbs(data.input[2])
                                                    : data.abspath + "temp" + node.path.sep + value,
                                                finalVar = (vflag === variants.length - 1);
                                            vflag += 1;
                                            zippy({final: finalVar, location: location, name: value});
                                        },
                                        tasks      = function biddle_publish_execution_variantsDir_each_copy_tasks() {
                                            node
                                                .child(varobj.tasks[0], function biddle_publish_execution_variantsDir_each_copy_tasks_child(ert, stdoutt, stdert) {
                                                    var len = varobj.tasks.length - 1;
                                                    if (ert !== null) {
                                                        console.log("\u001b[1m\u001b[31mError:\u001b[39m\u001b[0m with variant " + value + " on publish task");
                                                        console.log(varobj.tasks[0]);
                                                        console.log(ert);
                                                    } else if (stdert !== null && stdert !== "") {
                                                        console.log("\u001b[1m\u001b[31mError:\u001b[39m\u001b[0m with variant " + value + " on publish task");
                                                        console.log(varobj.tasks[0]);
                                                        console.log(stdert);
                                                    } else {
                                                        console.log("\u001b[1m\u001b[32mComplete:\u001b[39m\u001b[0m with variant " + value + " on publish task");
                                                        console.log(varobj.tasks[0]);
                                                        console.log(stdoutt);
                                                    }
                                                    varobj
                                                        .tasks
                                                        .splice(0, 1);
                                                    if (len > 0) {
                                                        biddle_publish_execution_variantsDir_each_copy_tasks();
                                                    } else {
                                                        complete();
                                                    }
                                                });
                                        },
                                        exclusions = function biddle_publish_execution_variantsDir_each_copy_exclusions() {
                                            apps
                                                .rmrecurse(data.abspath + "temp" + node.path.sep + value + node.path.sep + varobj.exclusions[0], function biddle_publish_execution_variantsDir_each_copy_exclusions_remove() {
                                                    var len = varobj.exclusions.length - 1;
                                                    varobj
                                                        .exclusions
                                                        .splice(0, 1);
                                                    if (len > 0) {
                                                        biddle_publish_execution_variantsDir_each_copy_exclusions();
                                                    } else if (varobj.tasks === "object" && varobj.tasks.length > 0) {
                                                        tasks();
                                                    } else {
                                                        complete();
                                                    }
                                                });
                                        };
                                    if (er !== null) {
                                        return apps.errout({error: er, name: "biddle_publish_execution_variantsDir_each_copy"});
                                    }
                                    if (stder !== null && stder !== "") {
                                        return apps.errout({error: stder, name: "biddle_publish_execution_variantsDir_each_copy"});
                                    }
                                    if (typeof varobj.exclusions !== "object" || typeof varobj.exclusions.join !== "function") {
                                        varobj.exclusions = [];
                                    }
                                    varobj.exclusions = varobj
                                        .exclusions
                                        .concat(data.ignore);
                                    if (varobj.exclusions.length > 0) {
                                        exclusions();
                                    } else if (varobj.tasks === "object" && varobj.tasks.length > 0) {
                                        tasks();
                                    } else {
                                        complete();
                                    }
                                    return stdout;
                                });
                            });
                    });
            };
        apps.getpjson(function biddle_publish_callback() {
            if (data.input[3] !== undefined && data.published[data.packjson.name] !== undefined) {
                data.published[data.packjson.name].directory = data.address.target + data.packjson.name;
            } else if (data.published[data.packjson.name] === undefined) {
                data.published[data.packjson.name]           = {};
                data.published[data.packjson.name].versions  = [];
                data.published[data.packjson.name].latest    = "";
                data.published[data.packjson.name].directory = data.address.target + data.packjson.name;
            }
            flag.getpjson = true;
            if (flag.ignore === true) {
                execution();
            }
        });
        node
            .fs
            .readFile(data.input[2].replace(/(\/|\\)$/, "") + node.path.sep + ".biddleignore", "utf8", function biddle_publish_ignore(err, data) {
                var errString = "";
                if (err !== null && err !== undefined) {
                    errString = err.toString();
                    if (errString.indexOf("Error: ENOENT: no such file or directory") === 0) {
                        flag.ignore = true;
                        if (flag.getpjson === true) {
                            execution();
                        }
                        return;
                    }
                    return apps.errout({error: err, name: "biddle_publish_ignore"});
                }
                data.ignore = data
                    .replace(/\r\n/g, "\n")
                    .replace(/\n+/g, "\n")
                    .replace(/^\n/, "")
                    .replace(/\n$/, "")
                    .split("\n")
                    .sort();
                flag.ignore = true;
                if (flag.getpjson === true) {
                    execution();
                }
            });
    };
    apps.readBinary  = function biddle_readBinary(filePath, callback) {
        var size        = 0,
            fdescript   = 0,
            writeBinary = function biddle_readBinary_writeBinary() {
                node
                    .fs
                    .open(data.address.downloads + node.path.sep + data.fileName, "w", function biddle_readBinary_writeBinary_writeopen(errx, fd) {
                        var buffer = new Buffer(size);
                        if (errx !== null) {
                            return apps.errout({error: errx, name: "biddle_readBinary_writeBinary_writeopen"});
                        }
                        node
                            .fs
                            .read(fdescript, buffer, 0, size, 0, function biddle_readBinary_writeBinary_writeopen_read(erry, ready, buffy) {
                                if (erry !== null) {
                                    return apps.errout({error: erry, name: "biddle_readBinary_writeBinary_writeopen_read"});
                                }
                                if (ready > 0) {
                                    node
                                        .fs
                                        .write(fd, buffy, 0, size, function biddle_readBinary_writeBinary_writeopen_read_write(errz, written, buffz) {
                                            if (errz !== null) {
                                                return apps.errout({error: errz, name: "biddle_readBinary_writeBinary_writeopen_read_write"});
                                            }
                                            if (written < 1) {
                                                return apps.errout({
                                                    error: "Reading binary file " + filePath + " but 0 bytes were read.",
                                                    name : "biddle_readBinary_writeBinary_writeopen_read_write"
                                                });
                                            }
                                            callback(buffz.toString("utf8", 0, written));
                                        });
                                }
                            });
                    });
            };
        node
            .fs
            .stat(filePath, function biddle_readBinary_stat(errs, stats) {
                if (errs !== null) {
                    return apps.errout({error: errs, name: "biddle_readBinary_stat"});
                }
                size = stats.size;
                node
                    .fs
                    .open(filePath, "r", function biddle_readyBinary_stat_open(erro, fd) {
                        var length = (stats.size < 100)
                                ? stats.size
                                : 100,
                            buffer = new Buffer(length);
                        fdescript = fd;
                        if (erro !== null) {
                            return apps.errout({error: erro, name: "biddle_readBinary_stat_open"});
                        }
                        node
                            .fs
                            .read(fd, buffer, 0, length, 1, function biddle_readyBinary_stat_open_read(errr, read, buff) {
                                var bstring = "";
                                if (errr !== null) {
                                    return apps.errout({error: errr, name: "biddle_readBinary_stat_open_read"});
                                }
                                bstring = buff.toString("utf8", 0, buff.length);
                                bstring = bstring.slice(2, bstring.length - 2);
                                if ((/[\u0002-\u0008]|[\u000e-\u001f]/).test(bstring) === true) {
                                    writeBinary();
                                } else {
                                    node
                                        .fs
                                        .readFile(filePath, "utf8", function biddle_readBinary_stat_open_read_readFile(errf, fileData) {
                                            if (errf !== null && errf !== undefined) {
                                                return apps.errout({error: errf, name: "biddle_readBinary_stat_open_read_readFile"});
                                            }
                                            if (data.command === "install" && (/(\.hash)$/).test(filePath) === true) {
                                                data.hashFile = fileData;
                                                callback(fileData);
                                            } else {
                                                apps.writeFile(fileData, apps.sanitizef(filePath), callback);
                                            }
                                        });
                                }
                                return read;
                            });
                    });
            });
    };
    apps.readlist    = function biddle_readlist() {
        var datalist = "";
        if (data.command === "publish" || (data.command === "list" && data.input[2] === "published")) {
            datalist = "published";
        } else if (data.command === "installed" || data.command === "status" || (data.command === "list" && data.input[2] === "installed")) {
            datalist = "installed";
        } else {
            return apps.errout({error: "Unqualified operation: readlist() but command is not published or installed.", name: "biddle_readlist"});
        }
        node
            .fs
            .readFile(datalist + ".json", "utf8", function biddle_readlist_readFile(err, fileData) {
                var jsondata = JSON.parse(fileData);
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_readlist_readFile"});
                }
                data[datalist]        = jsondata[datalist];
                data.status[datalist] = true;
            });
    };
    apps.relToAbs    = function biddle_relToAbs(filepath, fromBiddle) {
        var abs = (fromBiddle === true)
                ? data
                    .abspath
                    .replace(/((\/|\\)+)$/, "")
                    .split(node.path.sep)
                : data
                    .cwd
                    .replace(/((\/|\\)+)$/, "")
                    .split(node.path.sep),
            rel = filepath.split(node.path.sep);
        if (data.platform === "win32" && (/^(\w:\\)/).test(filepath) === true) {
            return filepath;
        }
        if (data.platform !== "win32" && filepath.charAt(0) === "/") {
            return filepath;
        }
        if (rel[0] === "..") {
            do {
                abs.pop();
                rel.splice(0, 1);
            } while (rel[0] === "..");
        }
        return abs.join(node.path.sep) + node.path.sep + rel.join(node.path.sep);
    };
    apps.rmrecurse   = function biddle_rmrecurse(dirToKill, callback) {
        var cmd = (process.platform === "win32")
            ? "powershell.exe -nologo -noprofile -command \"rm " + dirToKill + " -r -force\""
            : "rm -rf " + dirToKill;
        node.child(cmd, function biddle_rmrecurse_child(err, stdout, stderrout) {
            if (err !== null && err.toString().indexOf("No such file or directory") < 0 && err.toString().indexOf(": The directory is not empty.") < 0) {
                if (err.toString().indexOf("Cannot find path") > 0) {
                    return callback();
                }
                return apps.errout({error: err, name: "biddle_rmrecurse_child"});
            }
            if (stderrout !== null && stderrout !== "" && stderrout.indexOf("No such file or directory") < 0 && stderrout.indexOf(": The directory is not empty.") < 0) {
                return apps.errout({error: stderrout, name: "biddle_rmrecurse_child"});
            }
            callback();
            return stdout;
        });
    };
    apps.sanitizef   = function biddle_sanitizef(filePath) {
        var paths    = filePath.split(node.path.sep),
            fileName = paths.pop();
        paths.push(fileName.replace(/\+|<|>|:|"|\/|\\|\||\?|\*|%|\s/g, ""));
        return paths.join("");
    };
    apps.test        = function biddle_test() {
        var startTime = Date.now(),
            order     = [
                "moduleInstall",
                "lint",
                "hash",
                "help",
                "markdown",
                "get",
                "zip",
                "unzip",
                "publish",
                "unpublish"
                // "install", "list", "status", "uninstall
            ],
            options   = {
                correct     : false,
                crlf        : false,
                html        : true,
                inchar      : " ",
                insize      : 4,
                lang        : "javascript",
                methodchain : false,
                mode        : "beautify",
                nocaseindent: false,
                objsort     : "all",
                preserve    : true,
                styleguide  : "jslint",
                wrap        : 80
            },
            longname  = 0,
            namepad   = function biddle_test_namepad(name) {
                var a = name.length;
                if (name.length === longname) {
                    return name;
                }
                do {
                    a    += 1;
                    name = name + " ";
                } while (a < longname);
                return name;
            },
            modules   = {
                jslint    : {
                    dir    : data.abspath + "JSLint",
                    edition: function biddle_test_lint_modules_jslint(obj) {
                        console.log("* " + namepad(obj.name) + " - " + obj.app().edition);
                    },
                    file   : "jslint.js",
                    name   : "JSLint",
                    repo   : "https://github.com/douglascrockford/JSLint.git"
                },
                prettydiff: {
                    dir    : data.abspath + "prettydiff",
                    edition: function biddle_test_lint_modules_prettydiff(obj) {
                        var str = String(global.prettydiff.edition.latest);
                        console.log("* " + namepad(obj.name) + " - 20" + str.slice(0, 2) + "-" + str.slice(2, 4) + "-" + str.slice(4) + ", version " + global.prettydiff.edition.version);
                    },
                    file   : "prettydiff.js",
                    name   : "Pretty Diff",
                    repo   : "https://github.com/prettydiff/prettydiff.git"
                }
            },
            keys      = Object.keys(modules),
            childcmd  = (data.platform === "win32" && data.abspath === process.cwd().toLowerCase() + node.path.sep)
                ? "node biddle "
                : (data.platform !== "win32" && data.abspath === process.cwd() + node.path.sep)
                    ? "node biddle "
                    : "biddle ",
            testpath  = data.abspath + "unittest",
            humantime = function biddle_test_humantime(finished) {
                var minuteString = "",
                    hourString   = "",
                    secondString = "",
                    finalMem     = "",
                    minutes      = 0,
                    hours        = 0,
                    elapsed      = 0,
                    memory       = {},
                    prettybytes  = function biddle_test_humantime_prettybytes(an_integer) {
                        //find the string length of input and divide into triplets
                        var length  = an_integer
                                .toString()
                                .length,
                            triples = (function biddle_test_humantime_prettybytes_triples() {
                                if (length < 22) {
                                    return Math.floor((length - 1) / 3);
                                }
                                //it seems the maximum supported length of integer is 22
                                return 8;
                            }()),
                            //each triplet is worth an exponent of 1024 (2 ^ 10)
                            power   = (function biddle_test_humantime_prettybytes_power() {
                                var a = triples - 1,
                                    b = 1024;
                                if (triples === 0) {
                                    return 0;
                                }
                                if (triples === 1) {
                                    return 1024;
                                }
                                do {
                                    b = b * 1024;
                                    a -= 1;
                                } while (a > 0);
                                return b;
                            }()),
                            //kilobytes, megabytes, and so forth...
                            unit    = [
                                "",
                                "KB",
                                "MB",
                                "GB",
                                "TB",
                                "PB",
                                "EB",
                                "ZB",
                                "YB"
                            ],
                            output  = "";

                        if (typeof an_integer !== "number" || isNaN(an_integer) === true || an_integer < 0 || an_integer % 1 > 0) {
                            //input not a positive integer
                            output = "0.00B";
                        } else if (triples === 0) {
                            //input less than 1000
                            output = an_integer + "B";
                        } else {
                            //for input greater than 999
                            length = Math.floor((an_integer / power) * 100) / 100;
                            output = length.toFixed(2) + unit[triples];
                        }
                        return output;
                    },
                    plural       = function biddle_test_humantime_plural(x, y) {
                        var a = "";
                        if (x !== 1) {
                            a = x + y + "s ";
                        } else {
                            a = x + y + " ";
                        }
                        return a;
                    },
                    minute       = function biddle_test_humantime_minute() {
                        minutes      = parseInt((elapsed / 60), 10);
                        minuteString = (finished === true)
                            ? plural(minutes, " minute")
                            : (minutes < 10)
                                ? "0" + minutes
                                : "" + minutes;
                        minutes      = elapsed - (minutes * 60);
                        secondString = (finished === true)
                            ? (minutes === 1)
                                ? " 1 second "
                                : minutes.toFixed(3) + " seconds "
                            : minutes.toFixed(3);
                    };
                memory       = process.memoryUsage();
                finalMem     = prettybytes(memory.rss);

                //last line for additional instructions without bias to the timer
                elapsed      = (Date.now() - startTime) / 1000;
                secondString = elapsed.toFixed(3);
                if (elapsed >= 60 && elapsed < 3600) {
                    minute();
                } else if (elapsed >= 3600) {
                    hours      = parseInt((elapsed / 3600), 10);
                    elapsed    = elapsed - (hours * 3600);
                    hourString = (finished === true)
                        ? plural(hours, " hour")
                        : (hours < 10)
                            ? "0" + hours
                            : "" + hours;
                    minute();
                } else {
                    secondString = (finished === true)
                        ? plural(secondString, " second")
                        : secondString;
                }
                if (finished === true) {
                    if (data.platform === "win32") {
                        hourString = "\n" + hourString;
                    } else {
                        hourString = "\r\n" + hourString;
                    }
                    return finalMem + " of memory consumed" + hourString + minuteString + secondString + "total time";
                }
                if (hourString === "") {
                    hourString = "00";
                }
                if (minuteString === "") {
                    minuteString = "00";
                }
                if ((/^([0-9]\.)/).test(secondString) === true) {
                    secondString = "0" + secondString;
                }
                return "\u001b[36m[" + hourString + ":" + minuteString + ":" + secondString + "]\u001b[39m ";
            },
            diffFiles = function biddle_test_diffFiles(sampleName, sampleSource, sampleDiff) {
                var aa     = 0,
                    line   = 0,
                    pdlen  = 0,
                    count  = 0,
                    diffs  = 0,
                    lcount = 0,
                    report = [],
                    colors = {
                        del     : {
                            charEnd  : "\u001b[22m",
                            charStart: "\u001b[1m",
                            lineEnd  : "\u001b[39m",
                            lineStart: "\u001b[31m"
                        },
                        filepath: {
                            end  : "\u001b[39m",
                            start: "\u001b[36m"
                        },
                        ins     : {
                            charEnd  : "\u001b[22m",
                            charStart: "\u001b[1m",
                            lineEnd  : "\u001b[39m",
                            lineStart: "\u001b[32m"
                        }
                    };
                options.mode    = "diff";
                options.source  = sampleSource.replace(/\u001b/g, "\\u001b");
                options.diff    = sampleDiff.replace(/\u001b/g, "\\u001b");
                options.diffcli = true;
                options.context = 2;
                options.lang    = "text";
                report          = modules
                    .prettydiff
                    .app(options)[0];
                pdlen           = report[0].length;
                if (report.length < 3) {
                    console.log("");
                    console.log(colors.del.lineStart + "Test diff operation provided a bad code sample:" + colors.del.lineEnd);
                    console.log(report[0]);
                    return apps.errout({
                        error: colors.del.lineStart + "bad test" + colors.del.lineEnd,
                        name : sampleName,
                        time : humantime(true)
                    });
                }
                // report indexes from diffcli feature of diffview.js
                // 0. source line number
                // 1. source code line
                // 2. diff line number
                // 3. diff code line
                // 4. change
                // 5. index of options.context (not parallel) 6 - total count of differences
                if (sampleName !== "phases.simulations" && report[0][0] < 2) {
                    diffs += 1;
                    console.log("");
                    console.log(colors.filepath.start + sampleName);
                    console.log("Line: 1" + colors.filepath.end);
                }
                for (aa = 0; aa < pdlen; aa += 1) {
                    if (report[4][aa] === "equal" && report[4][aa + 1] === "equal" && report[4][aa + 2] !== undefined && report[4][aa + 2] !== "equal") {
                        count += 1;
                        if (count === 51) {
                            break;
                        }
                        line   = report[0][aa] + 2;
                        lcount = 0;
                        diffs  += 1;
                        console.log("");
                        console.log(colors.filepath.start + sampleName);
                        console.log("Line: " + line + colors.filepath.end);
                        if (aa === 0) {
                            console.log(report[3][aa]);
                            console.log(report[3][aa + 1]);
                        }
                    }
                    if (lcount < 7) {
                        lcount += 1;
                        if (report[4][aa] === "delete" && report[0][aa] !== report[0][aa + 1]) {
                            if (report[1][aa] === "") {
                                report[1][aa] = "(empty line)";
                            } else if (report[1][aa].replace(/\u0020+/g, "") === "") {
                                report[1][aa] = "(indentation)";
                            }
                            console.log(colors.del.lineStart + report[1][aa].replace(/<p(d)>/g, colors.del.charStart).replace(/<\/pd>/g, colors.del.charEnd) + colors.del.lineEnd);
                        } else if (report[4][aa] === "insert" && report[2][aa] !== report[2][aa + 1]) {
                            if (report[3][aa] === "") {
                                report[3][aa] = "(empty line)";
                            } else if (report[3][aa].replace(/\u0020+/g, "") === "") {
                                report[3][aa] = "(indentation)";
                            }
                            console.log(colors.ins.lineStart + report[3][aa].replace(/<p(d)>/g, colors.ins.charStart).replace(/<\/pd>/g, colors.ins.charEnd) + colors.ins.lineEnd);
                        } else if (report[4][aa] === "equal" && aa > 1) {
                            console.log(report[3][aa]);
                        } else if (report[4][aa] === "replace") {
                            console.log(colors.del.lineStart + report[1][aa].replace(/<p(d)>/g, colors.del.charStart).replace(/<\/pd>/g, colors.del.charEnd) + colors.del.lineEnd);
                            console.log(colors.ins.lineStart + report[3][aa].replace(/<p(d)>/g, colors.ins.charStart).replace(/<\/pd>/g, colors.ins.charEnd) + colors.ins.lineEnd);
                        }
                    }
                }
                console.log("");
                console.log(diffs + colors.filepath.start + " differences counted." + colors.filepath.end);
                apps.errout({
                    error: "Pretty Diff " + colors.del.lineStart + "failed" + colors.del.lineEnd + " in function: " + colors.filepath.start + sampleName + colors.filepath.end,
                    name : sampleName,
                    time : humantime(true)
                });
            },
            next      = function biddle_test_nextInit() {
                return;
            },
            phases    = {
                get          : function biddle_test_get() {
                    node
                        .child(childcmd + "get http://www.google.com " + data.abspath + "unittest childtest", function biddle_test_get_child(er, stdout, stder) {
                            var size = "";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_get_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_get_child", stdout: stdout, time: humantime(true)});
                            }
                            size = stdout.slice(stdout.indexOf("written at") + 10).replace(/(\s+)$/, "");
                            if ((/^(File\u0020)/).test(stdout) === false || stdout.indexOf(" 0 bytes") > 0 || size.replace(" bytes.", "").length < 4) {
                                return apps.errout({
                                    error: "Unexpected output for test 'get':\r\n\u001b[31m" + stdout + "\u001b[39m",
                                    name : "biddle_test_get_child",
                                    time : humantime(true)
                                });
                            }
                            console.log(humantime(false) + " \u001b[32mget test passed.\u001b[39m File written at" + size);
                            next();
                        });
                },
                hash         : function biddle_test_hash() {
                    node
                        .child(childcmd + "hash " + data.abspath + "LICENSE childtest", function biddle_test_hash_child(er, stdout, stder) {
                            var hashtest = "be09a71a2cda28b74e9dd206f46c1621aebe29182723f191d8109db4705ced014de469043c397fee" +
                                    "4d8f3483e396007ca739717af4bf43fed4c2e3dd14f3dc0c";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_hash_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_hash_child", stdout: stdout, time: humantime(true)});
                            }
                            stdout = stdout.replace(/(\r?\n)$/, "");
                            if (stdout !== hashtest) {
                                return diffFiles("biddle_test_hash_child", stdout, hashtest);
                            }
                            console.log(humantime(false) + " \u001b[32mhash test passed.\u001b[39m");
                            next();
                        });
                },
                help         : function biddle_test_help() {
                    var flag = {
                        "120": false,
                        "60" : false,
                        "80" : false
                    };
                    node.child(childcmd + "help 60 childtest", function biddle_test_help_60(er, stdout, stder) {
                        var helptest = "\n\u001b[4m\u001b[1m\u001b[31mbiddle\u001b[39m\u001b[0m\u001b[24m\n\u001b[3m" +
                                    "\u001b[33mA package management application without a package\nmanagement service" +
                                    ".\u001b[39m\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mLicense\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n  MIT, (\u001b[36mhttps://opensource.org/licenses/MIT\u001b[39m)\n\n" +
                                    "\u001b[4m\u001b[1m\u001b[36mVersion\u001b[39m\u001b[0m\u001b[24m\n  0.0.3\n\n" +
                                    "\u001b[4m\u001b[1m\u001b[36mAbout\u001b[39m\u001b[0m\u001b[24m\n  This applicati" +
                                    "on is a cross-OS solution to creating zip\n  files for distribution and fetching" +
                                    " files via HTTP(S).\n  The project's goal is to provide a universal application" +
                                    "\n  distribution utility that is language agnostic, operating\n  system independ" +
                                    "ent, and platform independent.  The only\n  additional requirement for distribut" +
                                    "ing application\n  packages is online storage on a web server.  This\n  applicat" +
                                    "ion provides all the utilities to retrieve,\n  bundle, and unpackage application" +
                                    "s.\n\n  biddle is inspired by the incredible awesomeness of\n  NPM, (\u001b[36mh" +
                                    "ttp://npmjs.com\u001b[39m), but seeks to accomplish a few\n  additional goals:\n" +
                                    "\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mintegrity\u001b[3" +
                                    "9m\u001b[0m - Downloaded packages will perform a\n    hash comparison before the" +
                                    "y are unpackaged.  If the\n    hashes don't match the zip file will be saved in " +
                                    "the\n    downloads directory awaiting a human touch.\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m \u001b[3m\u001b[33mautonomy\u001b[39m\u001b[0m - There is no" +
                                    " central authority here.\n    Host your own publications and manage them as you " +
                                    "please\n    with any name you choose.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m" +
                                    " \u001b[3m\u001b[33mmanagement\u001b[39m\u001b[0m - There is no dependency hell " +
                                    "here.\n    Dependency management will not be automated, but a means\n    to mana" +
                                    "ge and review the status of all\n    installed/published packages is provided.\n" +
                                    "  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mfreedom\u001b[39m" +
                                    "\u001b[0m - biddle will work everywhere Node.js\n    runs.  It can be used with " +
                                    "any application written in\n    any language whether binary or text.\n\n\u001b[4" +
                                    "m\u001b[1m\u001b[36mProject Status\u001b[39m\u001b[0m\u001b[24m\n  \u001b[1mUnst" +
                                    "able and in early developement.\u001b[0m\n\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m command \u001b[1mget\u001b[0m is complete\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m command \u001b[1mglobal\u001b[0m is complete\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mhash\u001b[0m is complete\n  " +
                                    "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mhelp\u001b[0m is comple" +
                                    "te\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mlist\u001b[0m is " +
                                    "complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mmarkdown" +
                                    "\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[" +
                                    "1munpublish\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m comm" +
                                    "and \u001b[1mzip\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m" +
                                    " command \u001b[1munzip\u001b[0m is complete\n\n\n  \u001b[1m\u001b[31m*\u001b[3" +
                                    "9m\u001b[0m although \u001b[1mlist\u001b[0m is marked as complete for thorough\n" +
                                    "    testing is required\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command " +
                                    "\u001b[1mpublish\u001b[0m is removed from complete status.\n    Variant publicat" +
                                    "ions by exclusion lists need to be\n    worked out.\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m need to add a \u001b[1mglobal\u001b[0m command to allow user" +
                                    "s to\n    promote biddle to global shell execution\n  \u001b[1m\u001b[31m*\u001b" +
                                    "[39m\u001b[0m add support for a \u001b[3m\u001b[33m.biddleignore\u001b[39m\u001b" +
                                    "[0m file, this file\n    contain a list of items to not include in the published" +
                                    "\n    zip\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m File is read\n    \u001b[" +
                                    "1m\u001b[31m-\u001b[39m\u001b[0m Support and processing is not added yet\n    " +
                                    "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m Will not include support for comments or" +
                                    "\n      wildcards in initial launch\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m a" +
                                    "dd support for \u001b[3m\u001b[33mvariants\u001b[39m\u001b[0m in package.json,\n" +
                                    "      which allows named variants where each has a custom\n      ignore list\n  " +
                                    "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m Work on \u001b[1minstall\u001b[0m is " +
                                    "\u001b[3m\u001b[33mblocked\u001b[39m\u001b[0m pending\n      configuration work" +
                                    "\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Hash files must now become JSON st" +
                                    "oring\n      hash, name, and version\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0" +
                                    "m ZIP approach needs to be reevaluated...\n      details in next point\n  \u001b" +
                                    "[1m\u001b[31m*\u001b[39m\u001b[0m need to work out \u001b[3m\u001b[33mglobal" +
                                    "\u001b[39m\u001b[0m install switch\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Ad" +
                                    "vanced configuration work is \u001b[3m\u001b[33munderway now\u001b[39m\u001b[0m." +
                                    "\n      Configuration details will go into the app's\n      package.json file.\n" +
                                    "    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m I need to revise the approach to cre" +
                                    "ating\n      ZIP files.  I cannot simply point to a directory and\n      zip it " +
                                    "for security reasons.  Instead I will need to\n      index the child items of th" +
                                    "e target directory for\n      addition to a ZIP file.  The reason has to do with" +
                                    "\n      potential (malicious), naming collisions uniformity\n      violations.\n" +
                                    "    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Allow restriction of named directori" +
                                    "es when\n      creating a zip so that production only packages don't\n      have" +
                                    " dev dependencies, build systems, unit tests,\n      systems files, and so forth" +
                                    "\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Allow definition of custom default" +
                                    "\n      locations.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Work on \u001b[1ms" +
                                    "tatus\u001b[0m is not started.  This command\n      will compare an installed ap" +
                                    "plication's version\n      against a published version to determine if out of\n " +
                                    "     date.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Must allow an app name a" +
                                    "s an argument to\n      manually check that application or \u001b[3m\u001b[33mal" +
                                    "l\u001b[39m\u001b[0m to check all\n      installed applications\n    \u001b[1m" +
                                    "\u001b[31m-\u001b[39m\u001b[0m Status automation or intervals would be\n      ni" +
                                    "ce... such as checking app versions once a week and\n      providing a message w" +
                                    "hen out of date\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Work on \u001b[1munin" +
                                    "stall\u001b[0m command is \u001b[3m\u001b[33mblocked\u001b[39m\u001b[0m pending" +
                                    "\n      completion of \u001b[1minstall\u001b[0m.\n    \u001b[1m\u001b[31m-\u001b" +
                                    "[39m\u001b[0m Must delete the application\n    \u001b[1m\u001b[31m-\u001b[39m" +
                                    "\u001b[0m Must remove the application from the \u001b[1mlist\u001b[0m\n\n\u001b[" +
                                    "4m\u001b[1m\u001b[36mSupported commands\u001b[39m\u001b[0m\u001b[24m\n  Commands" +
                                    " are the third command line argument, or second\n  if the optional \u001b[3m" +
                                    "\u001b[33mnode\u001b[39m\u001b[0m argument is absent.  Commands are\n  case inse" +
                                    "nsitive, but values and local paths are case\n  sensitive.  All local address ar" +
                                    "e either absolute from the\n  root or relative from the current working director" +
                                    "y.\n\n  \u001b[4m\u001b[1m\u001b[32mget\u001b[39m\u001b[0m\u001b[24m\n    Merely" +
                                    " downloads the requested resource and saves\n    it as a file with the same file" +
                                    "name. If the filename is\n    not provided in the URI the final directory up to " +
                                    "the\n    domain name will become the filename, and if for some\n    reason that " +
                                    "doesn't work the default filename is\n    \u001b[3m\u001b[33mdownload.xxx\u001b[" +
                                    "39m\u001b[0m.\n\n    Download a file to the default location, which is\n    the " +
                                    "provided \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32" +
                                    "m    node biddle get http://google.com\u001b[39m\n\n    Download a file to an al" +
                                    "ternate location.\n\n\u001b[32m    node biddle get http://google.com ../mydirect" +
                                    "ory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mglobal\u001b[39m\u001b[0m\u001b[2" +
                                    "4m\n    The global command adds biddle's path to the OS\n    path variable so th" +
                                    "at biddle can be run from any\n    location without explicitly calling Node.js, " +
                                    "example: \u001b[32mbiddle help\n    instead of \u001b[32mnode biddle help.\u001b" +
                                    "[39m Use the \u001b[32mremove \u001b[39moption to\n    remove biddle from the pa" +
                                    "th. This command requires use\n    of sudo in non-Windows environments or an adm" +
                                    "inistrative\n    console in Windows.\n\n    Allowing global availability to bidd" +
                                    "le in\n    non-Windows environments.\n\n\u001b[32m    sudo node biddle global" +
                                    "\u001b[39m\n\n    Removing global availability to biddle in\n    non-Windows env" +
                                    "ironments.\n\n\u001b[32m    sudo biddle global remove\u001b[39m\n\n    Allowing " +
                                    "global availability to biddle in Windows.\n    This command requires an administ" +
                                    "rative console.\n\n\u001b[32m    node biddle global\u001b[39m\n\n    Removing gl" +
                                    "obal availability to biddle in\n    non-Windows environments. This command requi" +
                                    "res an\n    administrative console.\n\n\u001b[32m    biddle global remove\u001b[" +
                                    "39m\n\n  \u001b[4m\u001b[1m\u001b[32mhash\u001b[39m\u001b[0m\u001b[24m\n    Prin" +
                                    "ts to console a SHA512 hash against a local\n    resource.\n\n\u001b[32m    node" +
                                    " biddle hash downloads/myfile.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhel" +
                                    "p\u001b[39m\u001b[0m\u001b[24m\n    Prints the readme.md file contents to consol" +
                                    "e in a\n    human friendly way.\n\n    No command will still generate the readme" +
                                    " data.\n\n\u001b[32m    node biddle\u001b[39m\n\n    The default word wrapping i" +
                                    "s set to 100 characters.\n\n\u001b[32m    node biddle help\u001b[39m\n\n    Set " +
                                    "a custom word wrap limit.\n\n\u001b[32m    node biddle help 80\u001b[39m\n\n  " +
                                    "\u001b[4m\u001b[1m\u001b[32minstall\u001b[39m\u001b[0m\u001b[24m\n    (not writt" +
                                    "en yet)\n    Downloads the requested resource, but decompresses\n    and unpacka" +
                                    "ges the zip before writing files to disk.\n\n  \u001b[4m\u001b[1m\u001b[32mlist" +
                                    "\u001b[39m\u001b[0m\u001b[24m\n    Will list all installed and/or published\n   " +
                                    " applications with their locations and latest versions.\n    It can take the opt" +
                                    "ional argument \u001b[3m\u001b[33minstalled\u001b[39m\u001b[0m or \u001b[3m" +
                                    "\u001b[33mpublished\u001b[39m\u001b[0m\n    to output a specific list or both li" +
                                    "sts are produced.\n\n    Only",
                            name     = "biddle_test_help_60";
                        if (er !== null) {
                            return apps.errout({error: er, name: name, stdout: stdout, time: humantime(true)});
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({error: stder, name: name, stdout: stdout, time: humantime(true)});
                        }
                        stdout = stdout
                            .replace(/\r\n/g, "\n")
                            .slice(0, 8192)
                            .replace(/(\\(\w+)?)$/, "");
                        if (stdout !== helptest) {
                            return diffFiles(name, stdout, helptest);
                        }
                        console.log(humantime(false) + " \u001b[32mhelp 60 test passed.\u001b[39m");
                        flag["60"] = true;
                        if (flag["80"] === true && flag["120"] === true) {
                            next();
                        }
                    });
                    node.child(childcmd + "help 80 childtest", function biddle_test_help_80(er, stdout, stder) {
                        var helptest = "\n\u001b[4m\u001b[1m\u001b[31mbiddle\u001b[39m\u001b[0m\u001b[24m\n\u001b[3m" +
                                    "\u001b[33mA package management application without a package management service." +
                                    "\u001b[39m\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mLicense\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n  MIT, (\u001b[36mhttps://opensource.org/licenses/MIT\u001b[39m)\n\n" +
                                    "\u001b[4m\u001b[1m\u001b[36mVersion\u001b[39m\u001b[0m\u001b[24m\n  0.0.3\n\n" +
                                    "\u001b[4m\u001b[1m\u001b[36mAbout\u001b[39m\u001b[0m\u001b[24m\n  This applicati" +
                                    "on is a cross-OS solution to creating zip files for\n  distribution and fetching" +
                                    " files via HTTP(S).  The project's goal is to provide\n  a universal application" +
                                    " distribution utility that is language agnostic,\n  operating system independent" +
                                    ", and platform independent.  The only additional\n  requirement for distributing" +
                                    " application packages is online storage on a web\n  server.  This application pr" +
                                    "ovides all the utilities to retrieve, bundle, and\n  unpackage applications.\n\n" +
                                    "  biddle is inspired by the incredible awesomeness of NPM,\n  (\u001b[36mhttp://" +
                                    "npmjs.com\u001b[39m), but seeks to accomplish a few additional goals:\n\n  " +
                                    "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mintegrity\u001b[39m" +
                                    "\u001b[0m - Downloaded packages will perform a hash comparison before\n    they " +
                                    "are unpackaged.  If the hashes don't match the zip file will be saved\n    in th" +
                                    "e downloads directory awaiting a human touch.\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m \u001b[3m\u001b[33mautonomy\u001b[39m\u001b[0m - There is no central a" +
                                    "uthority here.  Host your own\n    publications and manage them as you please wi" +
                                    "th any name you choose.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m" +
                                    "\u001b[33mmanagement\u001b[39m\u001b[0m - There is no dependency hell here.  Dep" +
                                    "endency management\n    will not be automated, but a means to manage and review " +
                                    "the status of all\n    installed/published packages is provided.\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mfreedom\u001b[39m\u001b[0m - b" +
                                    "iddle will work everywhere Node.js runs.  It can be used\n    with any applicati" +
                                    "on written in any language whether binary or text.\n\n\u001b[4m\u001b[1m\u001b[3" +
                                    "6mProject Status\u001b[39m\u001b[0m\u001b[24m\n  \u001b[1mUnstable and in early " +
                                    "developement.\u001b[0m\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command " +
                                    "\u001b[1mget\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m com" +
                                    "mand \u001b[1mglobal\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m command \u001b[1mhash\u001b[0m is complete\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m command \u001b[1mhelp\u001b[0m is complete\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mlist\u001b[0m is complete\n  " +
                                    "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mmarkdown\u001b[0m is co" +
                                    "mplete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1munpublish" +
                                    "\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[" +
                                    "1mzip\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command " +
                                    "\u001b[1munzip\u001b[0m is complete\n\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[" +
                                    "0m although \u001b[1mlist\u001b[0m is marked as complete for thorough testing is" +
                                    " required\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mpublish" +
                                    "\u001b[0m is removed from complete status. Variant publications\n    by exclusio" +
                                    "n lists need to be worked out.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m need t" +
                                    "o add a \u001b[1mglobal\u001b[0m command to allow users to promote biddle to\n  " +
                                    "  global shell execution\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m add support " +
                                    "for a \u001b[3m\u001b[33m.biddleignore\u001b[39m\u001b[0m file, this file contai" +
                                    "n a list of\n    items to not include in the published zip\n    \u001b[1m\u001b[" +
                                    "31m-\u001b[39m\u001b[0m File is read\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0" +
                                    "m Support and processing is not added yet\n    \u001b[1m\u001b[31m-\u001b[39m" +
                                    "\u001b[0m Will not include support for comments or wildcards in initial\n      l" +
                                    "aunch\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m add support for \u001b[3m\u001b" +
                                    "[33mvariants\u001b[39m\u001b[0m in package.json, which allows named\n      varia" +
                                    "nts where each has a custom ignore list\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[" +
                                    "0m Work on \u001b[1minstall\u001b[0m is \u001b[3m\u001b[33mblocked\u001b[39m" +
                                    "\u001b[0m pending configuration work\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0" +
                                    "m Hash files must now become JSON storing hash, name, and version\n    \u001b[1m" +
                                    "\u001b[31m-\u001b[39m\u001b[0m ZIP approach needs to be reevaluated... details i" +
                                    "n next point\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m need to work out \u001b[" +
                                    "3m\u001b[33mglobal\u001b[39m\u001b[0m install switch\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m Advanced configuration work is \u001b[3m\u001b[33munderway n" +
                                    "ow\u001b[39m\u001b[0m.  Configuration\n      details will go into the app's pack" +
                                    "age.json file.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m I need to revise the" +
                                    " approach to creating ZIP files.  I cannot\n      simply point to a directory an" +
                                    "d zip it for security reasons.  Instead I\n      will need to index the child it" +
                                    "ems of the target directory for addition to\n      a ZIP file.  The reason has t" +
                                    "o do with potential (malicious), naming\n      collisions uniformity violations." +
                                    "\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Allow restriction of named directo" +
                                    "ries when creating a zip so\n      that production only packages don't have dev " +
                                    "dependencies, build systems,\n      unit tests, systems files, and so forth\n   " +
                                    " \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Allow definition of custom default loca" +
                                    "tions.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Work on \u001b[1mstatus\u001b[" +
                                    "0m is not started.  This command will compare an\n      installed application's " +
                                    "version against a published version to determine\n      if out of date.\n    " +
                                    "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m Must allow an app name as an argument to" +
                                    " manually check that\n      application or \u001b[3m\u001b[33mall\u001b[39m" +
                                    "\u001b[0m to check all installed applications\n    \u001b[1m\u001b[31m-\u001b[39" +
                                    "m\u001b[0m Status automation or intervals would be nice... such as\n      checki" +
                                    "ng app versions once a week and providing a message when out of date\n  \u001b[1" +
                                    "m\u001b[31m*\u001b[39m\u001b[0m Work on \u001b[1muninstall\u001b[0m command is " +
                                    "\u001b[3m\u001b[33mblocked\u001b[39m\u001b[0m pending completion of\n      " +
                                    "\u001b[1minstall\u001b[0m.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Must del" +
                                    "ete the application\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Must remove the" +
                                    " application from the \u001b[1mlist\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mSupp" +
                                    "orted commands\u001b[39m\u001b[0m\u001b[24m\n  Commands are the third command li" +
                                    "ne argument, or second if the optional\n  \u001b[3m\u001b[33mnode\u001b[39m" +
                                    "\u001b[0m argument is absent.  Commands are case insensitive, but values and loc" +
                                    "al\n  paths are case sensitive.  All local address are either absolute from the " +
                                    "root\n  or relative from the current working directory.\n\n  \u001b[4m\u001b[1m" +
                                    "\u001b[32mget\u001b[39m\u001b[0m\u001b[24m\n    Merely downloads the requested r" +
                                    "esource and saves it as a file with the\n    same filename. If the filename is n" +
                                    "ot provided in the URI the final\n    directory up to the domain name will becom" +
                                    "e the filename, and if for some\n    reason that doesn't work the default filena" +
                                    "me is \u001b[3m\u001b[33mdownload.xxx\u001b[39m\u001b[0m.\n\n    Download a file" +
                                    " to the default location, which is the provided\n    \u001b[3m\u001b[33mdownload" +
                                    "s\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle get http://google.c" +
                                    "om\u001b[39m\n\n    Download a file to an alternate location.\n\n\u001b[32m    n" +
                                    "ode biddle get http://google.com ../mydirectory\u001b[39m\n\n  \u001b[4m\u001b[1" +
                                    "m\u001b[32mglobal\u001b[39m\u001b[0m\u001b[24m\n    The global command adds bidd" +
                                    "le's path to the OS path variable so that\n    biddle can be run from any locati" +
                                    "on without explicitly calling Node.js,\n    example: \u001b[32mbiddle help " +
                                    "\u001b[39minstead of \u001b[32mnode biddle help.\u001b[39m Use the \u001b[32mrem" +
                                    "ove \u001b[39moption to\n    remove biddle from the path. This command requires " +
                                    "use of sudo in\n    non-Windows environments or an administrative console in Win" +
                                    "dows.\n\n    Allowing global availability to biddle in non-Windows environments." +
                                    "\n\n\u001b[32m    sudo node biddle global\u001b[39m\n\n    Removing global avail" +
                                    "ability to biddle in non-Windows environments.\n\n\u001b[32m    sudo biddle glob" +
                                    "al remove\u001b[39m\n\n    Allowing global availability to biddle in Windows. Th" +
                                    "is command\n    requires an administrative console.\n\n\u001b[32m    node biddle" +
                                    " global\u001b[39m\n\n    Removing global availability to biddle in non-Windows e" +
                                    "nvironments.\n    This command requires an administrative console.\n\n\u001b[32m" +
                                    "    biddle global remove\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhash\u001b[3" +
                                    "9m\u001b[0m\u001b[24m\n    Prints to console a SHA512 hash against a local resou" +
                                    "rce.\n\n\u001b[32m    node biddle hash downloads/myfile.zip\u001b[39m\n\n  " +
                                    "\u001b[4m\u001b[1m\u001b[32mhelp\u001b[39m\u001b[0m\u001b[24m\n    Prints the re" +
                                    "adme.md file contents to console in a human friendly way.\n\n    No command will" +
                                    " still generate the readme data.\n\n\u001b[32m    node biddle\u001b[39m\n\n    T" +
                                    "he default word wrapping is set to 100 characters.\n\n\u001b[32m    node biddle " +
                                    "help\u001b[39m\n\n    Set a custom word wrap limit.\n\n\u001b[32m    node biddle" +
                                    " help 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32minstall\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n    (not written yet)\n    Downloads the requested resource, but dec" +
                                    "ompresses and unpackages the\n    zip before writing files to disk.\n\n  \u001b[" +
                                    "4m\u001b[1m\u001b[32mlist\u001b[39m\u001b[0m\u001b[24m\n    Will list all instal" +
                                    "led and/or published applications with their\n    locations and latest versions." +
                                    "  It can take the optional argument \u001b[3m\u001b[33minstalled\u001b[39m\u001b" +
                                    "[0m\n    or \u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m to output a specific" +
                                    " list or both lists are produced.\n\n    Only output the installed list.\n\n" +
                                    "\u001b[32m    node biddle list installed\u001b[39m\n\n    Output both lists\n\n" +
                                    "\u001b[32m    node biddle list\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[",
                            name     = "biddle_test_help_80";
                        if (er !== null) {
                            return apps.errout({error: er, name: name, stdout: stdout, time: humantime(true)});
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({error: stder, name: name, stdout: stdout, time: humantime(true)});
                        }
                        stdout = stdout
                            .replace(/\r\n/g, "\n")
                            .slice(0, 8192)
                            .replace(/(\\(\w+)?)$/, "");
                        if (stdout !== helptest) {
                            return diffFiles(name, stdout, helptest);
                        }
                        console.log(humantime(false) + " \u001b[32mhelp 80 test passed.\u001b[39m");
                        flag["80"] = true;
                        if (flag["60"] === true && flag["120"] === true) {
                            next();
                        }
                    });
                    node.child(childcmd + "help 120 childtest", function biddle_test_help_120(er, stdout, stder) {
                        var helptest = "\n\u001b[4m\u001b[1m\u001b[31mbiddle\u001b[39m\u001b[0m\u001b[24m\n\u001b[3m" +
                                    "\u001b[33mA package management application without a package management service." +
                                    "\u001b[39m\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mLicense\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n  MIT, (\u001b[36mhttps://opensource.org/licenses/MIT\u001b[39m)\n\n" +
                                    "\u001b[4m\u001b[1m\u001b[36mVersion\u001b[39m\u001b[0m\u001b[24m\n  0.0.3\n\n" +
                                    "\u001b[4m\u001b[1m\u001b[36mAbout\u001b[39m\u001b[0m\u001b[24m\n  This applicati" +
                                    "on is a cross-OS solution to creating zip files for distribution and fetching fi" +
                                    "les via HTTP(S).  The\n  project's goal is to provide a universal application di" +
                                    "stribution utility that is language agnostic, operating system\n  independent, a" +
                                    "nd platform independent.  The only additional requirement for distributing appli" +
                                    "cation packages is\n  online storage on a web server.  This application provides" +
                                    " all the utilities to retrieve, bundle, and unpackage\n  applications.\n\n  bidd" +
                                    "le is inspired by the incredible awesomeness of NPM, (\u001b[36mhttp://npmjs.com" +
                                    "\u001b[39m), but seeks to accomplish a few\n  additional goals:\n\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mintegrity\u001b[39m\u001b[0m -" +
                                    " Downloaded packages will perform a hash comparison before they are unpackaged. " +
                                    " If the hashes\n    don't match the zip file will be saved in the downloads dire" +
                                    "ctory awaiting a human touch.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[" +
                                    "3m\u001b[33mautonomy\u001b[39m\u001b[0m - There is no central authority here.  H" +
                                    "ost your own publications and manage them as you please with\n    any name you c" +
                                    "hoose.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mmanagement" +
                                    "\u001b[39m\u001b[0m - There is no dependency hell here.  Dependency management w" +
                                    "ill not be automated, but a means to\n    manage and review the status of all in" +
                                    "stalled/published packages is provided.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[" +
                                    "0m \u001b[3m\u001b[33mfreedom\u001b[39m\u001b[0m - biddle will work everywhere N" +
                                    "ode.js runs.  It can be used with any application written in any\n    language w" +
                                    "hether binary or text.\n\n\u001b[4m\u001b[1m\u001b[36mProject Status\u001b[39m" +
                                    "\u001b[0m\u001b[24m\n  \u001b[1mUnstable and in early developement.\u001b[0m\n\n" +
                                    "  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mget\u001b[0m is compl" +
                                    "ete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mglobal\u001b[0m " +
                                    "is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[1mhash" +
                                    "\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command \u001b[" +
                                    "1mhelp\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m command " +
                                    "\u001b[1mlist\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m co" +
                                    "mmand \u001b[1mmarkdown\u001b[0m is complete\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m command \u001b[1munpublish\u001b[0m is complete\n  \u001b[1m\u001b[31m" +
                                    "*\u001b[39m\u001b[0m command \u001b[1mzip\u001b[0m is complete\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m command \u001b[1munzip\u001b[0m is complete\n\n\n" +
                                    "  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m although \u001b[1mlist\u001b[0m is mar" +
                                    "ked as complete for thorough testing is required\n  \u001b[1m\u001b[31m*\u001b[3" +
                                    "9m\u001b[0m command \u001b[1mpublish\u001b[0m is removed from complete status. V" +
                                    "ariant publications by exclusion lists need to be worked\n    out.\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m need to add a \u001b[1mglobal\u001b[0m command to" +
                                    " allow users to promote biddle to global shell execution\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m add support for a \u001b[3m\u001b[33m.biddleignore\u001b[39m" +
                                    "\u001b[0m file, this file contain a list of items to not include in the publishe" +
                                    "d zip\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m File is read\n    \u001b[1m" +
                                    "\u001b[31m-\u001b[39m\u001b[0m Support and processing is not added yet\n    " +
                                    "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m Will not include support for comments or" +
                                    " wildcards in initial launch\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m add supp" +
                                    "ort for \u001b[3m\u001b[33mvariants\u001b[39m\u001b[0m in package.json, which al" +
                                    "lows named variants where each has a custom ignore list\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m Work on \u001b[1minstall\u001b[0m is \u001b[3m\u001b[33mbloc" +
                                    "ked\u001b[39m\u001b[0m pending configuration work\n    \u001b[1m\u001b[31m-" +
                                    "\u001b[39m\u001b[0m Hash files must now become JSON storing hash, name, and vers" +
                                    "ion\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m ZIP approach needs to be reeval" +
                                    "uated... details in next point\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m need t" +
                                    "o work out \u001b[3m\u001b[33mglobal\u001b[39m\u001b[0m install switch\n  \u001b" +
                                    "[1m\u001b[31m*\u001b[39m\u001b[0m Advanced configuration work is \u001b[3m\u001b" +
                                    "[33munderway now\u001b[39m\u001b[0m.  Configuration details will go into the app" +
                                    "'s package.json\n      file.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m I need" +
                                    " to revise the approach to creating ZIP files.  I cannot simply point to a direc" +
                                    "tory and zip it\n      for security reasons.  Instead I will need to index the c" +
                                    "hild items of the target directory for addition to a ZIP\n      file.  The reaso" +
                                    "n has to do with potential (malicious), naming collisions uniformity violations." +
                                    "\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Allow restriction of named directo" +
                                    "ries when creating a zip so that production only packages don't have\n      dev " +
                                    "dependencies, build systems, unit tests, systems files, and so forth\n    \u001b" +
                                    "[1m\u001b[31m-\u001b[39m\u001b[0m Allow definition of custom default locations." +
                                    "\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Work on \u001b[1mstatus\u001b[0m is " +
                                    "not started.  This command will compare an installed application's version again" +
                                    "st a\n      published version to determine if out of date.\n    \u001b[1m\u001b[" +
                                    "31m-\u001b[39m\u001b[0m Must allow an app name as an argument to manually check " +
                                    "that application or \u001b[3m\u001b[33mall\u001b[39m\u001b[0m to check all insta" +
                                    "lled\n      applications\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Status aut" +
                                    "omation or intervals would be nice... such as checking app versions once a week " +
                                    "and providing\n      a message when out of date\n  \u001b[1m\u001b[31m*\u001b[39" +
                                    "m\u001b[0m Work on \u001b[1muninstall\u001b[0m command is \u001b[3m\u001b[33mblo" +
                                    "cked\u001b[39m\u001b[0m pending completion of \u001b[1minstall\u001b[0m.\n    " +
                                    "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m Must delete the application\n    \u001b[" +
                                    "1m\u001b[31m-\u001b[39m\u001b[0m Must remove the application from the \u001b[1ml" +
                                    "ist\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mSupported commands\u001b[39m\u001b[0" +
                                    "m\u001b[24m\n  Commands are the third command line argument, or second if the op" +
                                    "tional \u001b[3m\u001b[33mnode\u001b[39m\u001b[0m argument is absent.  Commands " +
                                    "are case\n  insensitive, but values and local paths are case sensitive.  All loc" +
                                    "al address are either absolute from the root or\n  relative from the current wor" +
                                    "king directory.\n\n  \u001b[4m\u001b[1m\u001b[32mget\u001b[39m\u001b[0m\u001b[24" +
                                    "m\n    Merely downloads the requested resource and saves it as a file with the s" +
                                    "ame filename. If the filename is not\n    provided in the URI the final director" +
                                    "y up to the domain name will become the filename, and if for some reason that\n " +
                                    "   doesn't work the default filename is \u001b[3m\u001b[33mdownload.xxx\u001b[39" +
                                    "m\u001b[0m.\n\n    Download a file to the default location, which is the provide" +
                                    "d \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    no" +
                                    "de biddle get http://google.com\u001b[39m\n\n    Download a file to an alternate" +
                                    " location.\n\n\u001b[32m    node biddle get http://google.com ../mydirectory" +
                                    "\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mglobal\u001b[39m\u001b[0m\u001b[24m" +
                                    "\n    The global command adds biddle's path to the OS path variable so that bidd" +
                                    "le can be run from any location\n    without explicitly calling Node.js, example" +
                                    ": \u001b[32mbiddle help \u001b[39minstead of \u001b[32mnode biddle help.\u001b[3" +
                                    "9m Use the \u001b[32mremove \u001b[39moption to\n    remove biddle from the path" +
                                    ". This command requires use of sudo in non-Windows environments or an administra" +
                                    "tive\n    console in Windows.\n\n    Allowing global availability to biddle in n" +
                                    "on-Windows environments.\n\n\u001b[32m    sudo node biddle global\u001b[39m\n\n " +
                                    "   Removing global availability to biddle in non-Windows environments.\n\n\u001b" +
                                    "[32m    sudo biddle global remove\u001b[39m\n\n    Allowing global availability " +
                                    "to biddle in Windows. This command requires an administrative console.\n\n\u001b" +
                                    "[32m    node biddle global\u001b[39m\n\n    Removing global availability to bidd" +
                                    "le in non-Windows environments. This command requires an administrative\n    con" +
                                    "sole.\n\n\u001b[32m    biddle global remove\u001b[39m\n\n  \u001b[4m\u001b[1m" +
                                    "\u001b[32mhash\u001b[39m\u001b[0m\u001b[24m\n    Prints to console a SHA512 hash" +
                                    " against a local resource.\n\n\u001b[32m    node biddle hash downloads/myfile.zi" +
                                    "p\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhelp\u001b[39m\u001b[0m\u001b[24m\n" +
                                    "    Prints the readme.md file contents to console in a human friendly way.\n\n  " +
                                    "  No command will still generate the readme data.\n\n\u001b[32m    node biddle" +
                                    "\u001b[39m\n\n    The default word wrapping is set to 100 characters.\n\n\u001b[" +
                                    "32m    node biddle help\u001b[39m\n\n    Set a custom word wrap limit.\n\n\u001b" +
                                    "[32m    node biddle help 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32minstall" +
                                    "\u001b[39m\u001b[0m\u001b[24m\n    (not written yet)\n    Downloads the requeste" +
                                    "d resource, but decompresses and unpackages the zip before writing files to disk" +
                                    ".\n\n  \u001b[4m\u001b[1m\u001b[32mlist\u001b[39m\u001b[0m\u001b[24m\n    Will l" +
                                    "ist all installed and/or published applications with their locations and latest " +
                                    "versions.  It can take\n    the optional argument \u001b[3m\u001b[33minstalled" +
                                    "\u001b[39m\u001b[0m or \u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m to output" +
                                    " a specific list or both lists are produced.\n\n    Only output the installed li" +
                                    "st.\n\n\u001b[32m    node biddle list installed\u001b[39m\n\n    Output both lis" +
                                    "ts\n\n\u001b[32m    node biddle list\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32m" +
                                    "markdown\u001b[39m\u001b[0m\u001b[24m\n    Allows the internal markdown parser u" +
                                    "sed by the \u001b[1mhelp\u001b[",
                            name     = "biddle_test_help_120";
                        if (er !== null) {
                            return apps.errout({error: er, name: name, stdout: stdout, time: humantime(true)});
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({error: stder, name: name, stdout: stdout, time: humantime(true)});
                        }
                        stdout = stdout
                            .replace(/\r\n/g, "\n")
                            .slice(0, 8192)
                            .replace(/(\\(\w+)?)$/, "");
                        if (stdout !== helptest) {
                            return diffFiles(name, stdout, helptest);
                        }
                        console.log(humantime(false) + " \u001b[32mhelp 120 test passed.\u001b[39m");
                        flag["120"] = true;
                        if (flag["60"] === true && flag["80"] === true) {
                            next();
                        }
                    });
                },
                lint         : function biddle_test_lint() {
                    var ignoreDirectory = [
                            ".git",
                            "applications",
                            "bin",
                            "downloads",
                            "publications",
                            "unittest"
                        ],
                        files           = [],
                        lintrun         = function biddle_test_lint_lintrun() {
                            var lintit = function biddle_test_lint_lintrun_lintit(val, ind, arr) {
                                var result = {},
                                    failed = false,
                                    ecount = 0,
                                    report = function biddle_test_lint_lintrun_lintit_lintOn_report(warning) {
                                        //start with an exclusion list.  There are some warnings that I don't care about
                                        if (warning === null) {
                                            return;
                                        }
                                        if (warning.message.indexOf("Unexpected dangling '_'") === 0) {
                                            return;
                                        }
                                        if ((/Bad\u0020property\u0020name\u0020'\w+_'\./).test(warning.message) === true) {
                                            return;
                                        }
                                        if (warning.message.indexOf("/*global*/ requires") === 0) {
                                            return;
                                        }
                                        failed = true;
                                        if (ecount === 0) {
                                            console.log("\u001b[31mJSLint errors on\u001b[39m " + val[0]);
                                            console.log("");
                                        }
                                        ecount += 1;
                                        console.log("On line " + warning.line + " at column: " + warning.column);
                                        console.log(warning.message);
                                        console.log("");
                                    };
                                options.source = val[1];
                                result         = modules
                                    .jslint
                                    .app(modules.prettydiff.app(options), {"for": true});
                                if (result.ok === true) {
                                    console.log(humantime(false) + "\u001b[32mLint is good for file " + (ind + 1) + ":\u001b[39m " + val[0]);
                                    if (ind === arr.length - 1) {
                                        console.log("\u001b[32mLint operation complete!\u001b[39m");
                                        return next();
                                    }
                                } else {
                                    result
                                        .warnings
                                        .forEach(report);
                                    if (failed === true) {
                                        return apps.errout({error: "\u001b[31mLint fail\u001b[39m :(", name: "biddle_test_lint_lintrun_lintit", time: humantime(true)});
                                    }
                                    console.log(humantime(false) + "\u001b[32mLint is good for file " + (ind + 1) + ":\u001b[39m " + val[0]);
                                    if (ind === arr.length - 1) {
                                        console.log("\u001b[32mLint operation complete!\u001b[39m");
                                        next();
                                    }
                                }
                            };
                            options = {
                                correct     : false,
                                crlf        : false,
                                html        : true,
                                inchar      : " ",
                                insize      : 4,
                                lang        : "javascript",
                                methodchain : false,
                                mode        : "beautify",
                                nocaseindent: false,
                                objsort     : "all",
                                preserve    : true,
                                styleguide  : "jslint",
                                wrap        : 80
                            };
                            files.forEach(lintit);
                        };
                    console.log("\u001b[36mBeautifying and Linting\u001b[39m");
                    console.log("** Note that line numbers of error messaging reflects beautified code line.");
                    ignoreDirectory.forEach(function biddle_test_lint_absignore(value, index, array) {
                        array[index] = data.abspath + value;
                    });
                    keys.forEach(function biddle_test_lint_updateIgnores(mod) {
                        ignoreDirectory.push(modules[mod].dir);
                    });
                    (function biddle_test_lint_getFiles() {
                        var enddir    = 0,
                            enditem   = 0,
                            endread   = 0,
                            startdir  = 0,
                            startitem = 0,
                            startread = 0,
                            idLen     = ignoreDirectory.length,
                            readFile  = function biddle_test_lint_getFiles_readFile(filePath) {
                                node
                                    .fs
                                    .readFile(filePath, "utf8", function biddle_test_lint_getFiles_readFile_callback(err, data) {
                                        if (err !== null && err !== undefined) {
                                            return apps.errout({error: err, name: "biddle_test_lint_getFiles_readFile_callback", time: humantime(false)});
                                        }
                                        files.push([filePath, data]);
                                        endread += 1;
                                        if (endread === startread && enditem === startitem && enddir === startdir) {
                                            lintrun();
                                        }
                                    });
                            },
                            readDir   = function biddle_test_lint_getFiles_readDir(filepath) {
                                startdir += 1;
                                node
                                    .fs
                                    .readdir(filepath, function biddle_test_lint_getFiles_readDir_callback(erra, list) {
                                        var fileEval = function biddle_test_lint_getFiles_readDir_callback_fileEval(val) {
                                            var filename = (filepath.charAt(filepath.length - 1) === node.path.sep)
                                                ? filepath + val
                                                : filepath + node.path.sep + val;
                                            node
                                                .fs
                                                .stat(filename, function biddle_test_lint_getFiles_readDir_callback_fileEval_stat(errb, stat) {
                                                    var a = 0;
                                                    if (errb !== null) {
                                                        return apps.errout({error: errb, name: "biddle_test_lint_getFiles_readDir_callback_fileEval_stat", time: humantime(false)});
                                                    }
                                                    enditem += 1;
                                                    if (stat.isFile() === true && (/(\.js)$/).test(filename) === true) {
                                                        startread += 1;
                                                        readFile(filename);
                                                    }
                                                    if (stat.isDirectory() === true) {
                                                        do {
                                                            if (filename === ignoreDirectory[a]) {
                                                                if (endread === startread && enditem === startitem && enddir === startdir) {
                                                                    lintrun();
                                                                }
                                                                return;
                                                            }
                                                            a += 1;
                                                        } while (a < idLen);
                                                        biddle_test_lint_getFiles_readDir(filename);
                                                    }
                                                });
                                        };
                                        if (erra !== null) {
                                            return apps.errout({
                                                error: "Error reading path: " + filepath + "\n" + erra,
                                                name : "biddle_test_lint_getFiles_readDir_callback",
                                                time : humantime(false)
                                            });
                                        }
                                        enddir    += 1;
                                        startitem += list.length;
                                        list.forEach(fileEval);
                                    });
                            };
                        readDir(data.abspath);
                    }());
                },
                markdown     : function biddle_test_markdown() {
                    var flag = {
                        "120": false,
                        "60" : false,
                        "80" : false
                    };
                    node.child(childcmd + "markdown " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "READMEa.md 60 childtest", function biddle_test_markdown_60(er, stdout, stder) {
                        var markdowntest = "\nTry it online at http://prettydiff.com/,\n(\u001b[36mhttp://prettydiff.com/" +
                                    "\u001b[39m).\n\n\u001b[4m\u001b[1m\u001b[31mPretty Diff logo Pretty Diff\u001b[3" +
                                    "9m\u001b[0m\u001b[24m\n\nTravis CI Build,\n(\u001b[36mhttps://travis-ci.org/pret" +
                                    "tydiff/prettydiff\u001b[39m)\nAppVeyor Build,\n(\u001b[36mhttps://ci.appveyor.co" +
                                    "m/project/prettydiff/prettydiff\u001b[39m)\nGitter,\n(\u001b[36mhttps://gitter.i" +
                                    "m/prettydiff/prettydiff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&" +
                                    "utm_content=badge\u001b[39m)\nTwitter Tweets,\n(\u001b[36mhttps://twitter.com/in" +
                                    "tent/tweet?text=Handy%20web%20development%20tool:%20%20url=http%3A%2F%2Fprettydi" +
                                    "ff.com\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mSummary\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n\n  Language aware code comparison tool for several web\n  based lan" +
                                    "guages. It also beautifies, minifies, and a few\n  other things.\n\n\u001b[4m" +
                                    "\u001b[1m\u001b[36mBenefits - see overview page, (http://prettydiff.com/overview" +
                                    ".xhtml), for more details\u001b[39m\u001b[0m\u001b[24m\n\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m ES6 / JS2015 ready\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0" +
                                    "m React JSX format support,\n    (\u001b[36mhttp://prettydiff.com/guide/react_js" +
                                    "x.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m LESS, SCSS (Sass)," +
                                    " and CSS support\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Separate support for" +
                                    " XML and HTML\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Recursive command line " +
                                    "directory diff,\n    (\u001b[36mhttp://prettydiff.com/guide/diffcli.xhtml\u001b[" +
                                    "39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m JavaScript scope in colors,\n   " +
                                    " (\u001b[36mhttp://prettydiff.com/guide/jshtml.xhtml\u001b[39m)\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m Supports presets for popular styleguides,\n    (" +
                                    "\u001b[36mhttp://prettydiff.com/guide/styleguide.xhtml\u001b[39m)\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m Markup beautification with optional opt out,\n   " +
                                    " (\u001b[36mhttp://prettydiff.com/guide/tag_ignore.xhtml\u001b[39m)\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m JavaScript auto correction,\n    (\u001b[36mhttp:" +
                                    "//prettydiff.com/guide/jscorrect.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[" +
                                    "39m\u001b[0m Supports a ton of options,\n    (\u001b[36mhttp://prettydiff.com/do" +
                                    "cumentation.php#function_properties\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m Default beautifier,\n    (\u001b[36mhttps://atom.io/packages/atom-beau" +
                                    "tify/\u001b[39m), for several\n    languages in Atom.io, (\u001b[36mhttps://atom" +
                                    ".io/\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mExecuting Pretty Diff\u001b[39m" +
                                    "\u001b[0m\u001b[24m\n\n  \u001b[4m\u001b[1m\u001b[32mRun with Node.js / CommonJS" +
                                    " / RequireJS\u001b[39m\u001b[0m\u001b[24m\n\n    A Node.js command line utility " +
                                    "is provided by\n    api/node-local.js.  This file can execute in the\n    follow" +
                                    "ing modes:\n\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m auto - Determine if th" +
                                    "e resource is text, a\n      file, or a directory and process as such (except th" +
                                    "at\n      directories are processed with the subdirectory option)\n    \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m screen - code input is on the command line\n     " +
                                    " and output is to the command line\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m " +
                                    "filescreen - code input is in a file and the\n      output is to the command lin" +
                                    "e\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m file - the input and the output r" +
                                    "eside in\n      files\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m directory - e" +
                                    "verything in a directory is\n      processed into a specified output directory e" +
                                    "xcept\n      \".\", \"..\", and subdirectories\n    \u001b[1m\u001b[31m*\u001b[3" +
                                    "9m\u001b[0m subdirectory - process the entire directory\n      tree\n\n    " +
                                    "\u001b[4m\u001b[1m\u001b[33mExecute in the context of a NodeJS application\u001b" +
                                    "[39m\u001b[0m\u001b[24m\n\n      Add this code to your application\n\n\u001b[32m" +
                                    "    var prettydiff = require(\"prettydiff\"),\u001b[39m\n\u001b[32m        args " +
                                    "      = {\u001b[39m\n\u001b[32m            source: \"asdf\",\u001b[39m\n\u001b[3" +
                                    "2m            diff  : \"asdd\",\u001b[39m\n\u001b[32m            lang  : \"text" +
                                    "\"\u001b[39m\n\u001b[32m        },\u001b[39m\n\u001b[32m        output     = pre" +
                                    "ttydiff(args);\u001b[39m\n\n    \u001b[4m\u001b[1m\u001b[33mExecute from the com" +
                                    "mand line\u001b[39m\u001b[0m\u001b[24m\n\n      Run in windows\n\n\u001b[32m    " +
                                    "node api/node-local.js source:\"c:\\myDirectory\" readmethod:\"subdirectory\" di" +
                                    "ff:\"c:\\myOtherDirectory\"\u001b[39m\n\n      Run in Linux and OSX\n\n\u001b[32" +
                                    "m    node api/node-local.js source:\"myDirectory\" mode:\"beautify\" readmethod:" +
                                    "\"subdirectory\" output:\"path/to/outputDirectory\"\u001b[39m\n\n      To see a " +
                                    "\u001b[3m\u001b[33mman\u001b[39m\u001b[0m page provide no arguments or\n      th" +
                                    "ese: help, man, manual\n\n\u001b[32m    node api/node-local.js h\u001b[39m\n" +
                                    "\u001b[32m    node api/node-local.js help\u001b[39m\n\u001b[32m    node api/node" +
                                    "-local.js man\u001b[39m\n\u001b[32m    node api/node-local.js manual\u001b[39m\n" +
                                    "\n      To see only the version number supply only \u001b[3m\u001b[33mv\u001b[39" +
                                    "m\u001b[0m or\n      \u001b[3m\u001b[33mversion\u001b[39m\u001b[0m as an argumen" +
                                    "t:\n\n\u001b[32m    node api/node-local.js v\u001b[39m\n\u001b[32m    node api/n" +
                                    "ode-local.js version\u001b[39m\n\n      To see a list of current settings on the" +
                                    "\n      console supply \u001b[3m\u001b[33mlist\u001b[39m\u001b[0m as an argument" +
                                    ":\n\n\u001b[32m    node api/node-local.js l\u001b[39m\n\u001b[32m    node api/no" +
                                    "de-local.js list\u001b[39m\n\n    \u001b[4m\u001b[1m\u001b[33mSet configurations" +
                                    " with a **.prettydiffrc** file.\u001b[39m\u001b[0m\u001b[24m\n\n      Pretty Dif" +
                                    "f will first look for a .prettydiffrc\n      file from the current directory in " +
                                    "the command prompt.\n      If the .prettydiffrc is not present in the current\n " +
                                    "     directory it will then look for it in the\n      application's directory.\n" +
                                    "\n      The .prettydiffrc first checks for JSON format.\n      This allows a sim" +
                                    "ple means of defining options in a\n      file. It also allows a JavaScript appl" +
                                    "ication format,\n      (\u001b[36mhttp://prettydiff.com/.prettydiffrc\u001b[39m)" +
                                    ", so that options\n      can be set conditionally.\n\n  \u001b[4m\u001b[1m\u001b" +
                                    "[32mRun in a web browser with api/dom.js\u001b[39m\u001b[0m\u001b[24m\n\n    Ple" +
                                    "ase feel free to use index.xhtml file to\n    supplement dom.js.  Otherwise, dom" +
                                    ".js requires\n    supplemental assistance to map DOM nodes from an HTML\n    sou" +
                                    "rce.  dom.js is fault tolerant so nodes mapped to the\n    supplied index.xhtml " +
                                    "don't need to be supported from\n    custom HTML.\n\n    To run Pretty Diff usin" +
                                    "g dom.js include the\n    following two script tags and bind the\n    global.pre" +
                                    "ttydiff.pd.recycle(), function to the\n    executing event.  Please refer to ind" +
                                    "ex.xhtml for an\n    HTML example and documentation.xhtml for option and\n    ex" +
                                    "ecution information.\n\n\u001b[32m    <script src=\"lib/global.js\" type=\"appli" +
                                    "cation/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"lib/languag" +
                                    "e.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b[32m    <scrip" +
                                    "t src=\"lib/options.js\" type=\"application/javascript\"></script>\u001b[39m\n" +
                                    "\u001b[32m    <script src=\"lib/finalFile.js\" type=\"application/javascript\"><" +
                                    "/script>\u001b[39m\n\u001b[32m    <script src=\"lib/safeSort.js\" type=\"applica" +
                                    "tion/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"ace/ace.js\" " +
                                    "type=\"application/javascript\"></script> **(optional)**\u001b[39m\n\u001b[32m  " +
                                    "  <script src=\"api/dom.js\" type=\"application/javascript\"></script>\u001b[39m" +
                                    "\n\u001b[32m    <script src=\"lib/csspretty.js\" type=\"application/javascript\"" +
                                    "></script>\u001b[39m\n\u001b[32m    <script src=\"lib/csvpretty.js\" type=\"appl" +
                                    "ication/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"lib/diffvi" +
                                    "ew.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b[32m    <scri" +
                                    "pt src=\"lib/jspretty.js\" type=\"application/javascript\"></script>\u001b[39m\n" +
                                    "\u001b[32m    <script src=\"lib/markuppretty.js\" type=\"application/javascript" +
                                    "\"></script>\u001b[39m\n\u001b[32m    <script src=\"prettydiff.js\" type=\"appli" +
                                    "cation/javascript\"></script>\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mExecute" +
                                    " with vanilla JS\u001b[39m\u001b[0m\u001b[24m\n\n\u001b[32m    var global = {}," +
                                    "\u001b[39m\n\u001b[32m        args   = {\u001b[39m\n\u001b[32m            source" +
                                    ": \"asdf\",\u001b[39m\n\u001b[32m            diff  : \"asdd\",\u001b[39m\n\u001b" +
                                    "[32m            lang  : \"text\"\u001b[39m\n\u001b[32m        },\u001b[39m\n" +
                                    "\u001b[32m        output = prettydiff(args);\u001b[39m\n\n  \u001b[4m\u001b[1m" +
                                    "\u001b[32mRun Pretty Diff in Atom, (https://atom.io/), code editor with the atom" +
                                    "-beautify, (https://atom.io/packages/atom-beautify), package.\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n\n  \u001b[4m\u001b[1m\u001b[32mRun the unit tests\u001b[39m\u001b[0" +
                                    "m\u001b[24m\n\n\u001b[32m    cd prettydiff\u001b[39m\n\u001b[32m    node test/li" +
                                    "nt.js\u001b[39m\n\n\u001b[4m\u001b[1m\u001b[36mLicense:\u001b[39m\u001b[0m\u001b" +
                                    "[24m\n\n   \u001b[1m@source\u001b[0m http://prettydiff.com/prettydiff.js\n\n   " +
                                    "\u001b[1m@documentation\u001b[0m English:\n  http://prettydiff.com/documentation" +
                                    ".xhtml\n\n   \u001b[1m@licstart\u001b[0m The following is the entire license not" +
                                    "ice\n  for Pretty Diff.\n\n   This code may not be used or redistributed unless " +
                                    "the\n  following\n   conditions are met:\n\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m Prettydiff created by Austin Cheney originally on\n    3 Mar 2009. htt" +
                                    "p://prettydiff.com/\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m The use of diffvi" +
                                    "ew.js and prettydiff.js must\n    contain the following copyright:\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m Copyright (c), 2007, Snowtide Informatics\n    Sy" +
                                    "stems, Inc. All rights reserved.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Re" +
                                    "distributions of source code must retain\n      the above copyright notice, this" +
                                    " list of conditions\n      and the following disclaimer.\n    \u001b[1m\u001b[31" +
                                    "m-\u001b[39m\u001b[0m Redistributions in binary form must\n      reproduce the",
                            name         = "biddle_test_markdown_60";
                        if (er !== null) {
                            return apps.errout({error: er, name: name, stdout: stdout, time: humantime(true)});
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({error: stder, name: name, stdout: stdout, time: humantime(true)});
                        }
                        stdout = stdout
                            .replace(/\r\n/g, "\n")
                            .slice(0, 8192)
                            .replace(/(\\(\w+)?)$/, "");
                        if (stdout !== markdowntest) {
                            return diffFiles(name, stdout, markdowntest);
                        }
                        console.log(humantime(false) + " \u001b[32mmarkdown 60 test passed.\u001b[39m");
                        flag["60"] = true;
                        if (flag["80"] === true && flag["120"] === true) {
                            next();
                        }
                    });
                    node.child(childcmd + "markdown " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "READMEa.md 80 childtest", function biddle_test_markdown_80(er, stdout, stder) {
                        var markdowntest = "\nTry it online at http://prettydiff.com/, (\u001b[36mhttp://prettydiff.com/" +
                                    "\u001b[39m).\n\n\u001b[4m\u001b[1m\u001b[31mPretty Diff logo Pretty Diff\u001b[3" +
                                    "9m\u001b[0m\u001b[24m\n\nTravis CI Build, (\u001b[36mhttps://travis-ci.org/prett" +
                                    "ydiff/prettydiff\u001b[39m)\nAppVeyor Build, (\u001b[36mhttps://ci.appveyor.com/" +
                                    "project/prettydiff/prettydiff\u001b[39m)\nGitter,\n(\u001b[36mhttps://gitter.im/" +
                                    "prettydiff/prettydiff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&ut" +
                                    "m_content=badge\u001b[39m)\nTwitter Tweets,\n(\u001b[36mhttps://twitter.com/inte" +
                                    "nt/tweet?text=Handy%20web%20development%20tool:%20%20url=http%3A%2F%2Fprettydiff" +
                                    ".com\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mSummary\u001b[39m\u001b[0m\u001b[" +
                                    "24m\n\n  Language aware code comparison tool for several web based languages. It" +
                                    "\n  also beautifies, minifies, and a few other things.\n\n\u001b[4m\u001b[1m" +
                                    "\u001b[36mBenefits - see overview page, (http://prettydiff.com/overview.xhtml), " +
                                    "for more details\u001b[39m\u001b[0m\u001b[24m\n\n  \u001b[1m\u001b[31m*\u001b[39" +
                                    "m\u001b[0m ES6 / JS2015 ready\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m React J" +
                                    "SX format support,\n    (\u001b[36mhttp://prettydiff.com/guide/react_jsx.xhtml" +
                                    "\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m LESS, SCSS (Sass), and CS" +
                                    "S support\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Separate support for XML an" +
                                    "d HTML\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Recursive command line directo" +
                                    "ry diff,\n    (\u001b[36mhttp://prettydiff.com/guide/diffcli.xhtml\u001b[39m)\n " +
                                    " \u001b[1m\u001b[31m*\u001b[39m\u001b[0m JavaScript scope in colors, (\u001b[36m" +
                                    "http://prettydiff.com/guide/jshtml.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m Supports presets for popular styleguides,\n    (\u001b[36mht" +
                                    "tp://prettydiff.com/guide/styleguide.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m Markup beautification with optional opt out,\n    (\u001b[36" +
                                    "mhttp://prettydiff.com/guide/tag_ignore.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m JavaScript auto correction,\n    (\u001b[36mhttp://prettydif" +
                                    "f.com/guide/jscorrect.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0" +
                                    "m Supports a ton of options,\n    (\u001b[36mhttp://prettydiff.com/documentation" +
                                    ".php#function_properties\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m D" +
                                    "efault beautifier, (\u001b[36mhttps://atom.io/packages/atom-beautify/\u001b[39m)" +
                                    ", for\n    several languages in Atom.io, (\u001b[36mhttps://atom.io/\u001b[39m)" +
                                    "\n\n\u001b[4m\u001b[1m\u001b[36mExecuting Pretty Diff\u001b[39m\u001b[0m\u001b[2" +
                                    "4m\n\n  \u001b[4m\u001b[1m\u001b[32mRun with Node.js / CommonJS / RequireJS" +
                                    "\u001b[39m\u001b[0m\u001b[24m\n\n    A Node.js command line utility is provided " +
                                    "by api/node-local.js.  This\n    file can execute in the following modes:\n\n   " +
                                    " \u001b[1m\u001b[31m*\u001b[39m\u001b[0m auto - Determine if the resource is tex" +
                                    "t, a file, or a directory\n      and process as such (except that directories ar" +
                                    "e processed with the\n      subdirectory option)\n    \u001b[1m\u001b[31m*\u001b" +
                                    "[39m\u001b[0m screen - code input is on the command line and output is to the\n " +
                                    "     command line\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m filescreen - code" +
                                    " input is in a file and the output is to the\n      command line\n    \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m file - the input and the output reside in files\n" +
                                    "    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m directory - everything in a director" +
                                    "y is processed into a\n      specified output directory except \".\", \"..\", an" +
                                    "d subdirectories\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subdirectory - pro" +
                                    "cess the entire directory tree\n\n    \u001b[4m\u001b[1m\u001b[33mExecute in the" +
                                    " context of a NodeJS application\u001b[39m\u001b[0m\u001b[24m\n\n      Add this " +
                                    "code to your application\n\n\u001b[32m    var prettydiff = require(\"prettydiff" +
                                    "\"),\u001b[39m\n\u001b[32m        args       = {\u001b[39m\n\u001b[32m          " +
                                    "  source: \"asdf\",\u001b[39m\n\u001b[32m            diff  : \"asdd\",\u001b[39m" +
                                    "\n\u001b[32m            lang  : \"text\"\u001b[39m\n\u001b[32m        },\u001b[3" +
                                    "9m\n\u001b[32m        output     = prettydiff(args);\u001b[39m\n\n    \u001b[4m" +
                                    "\u001b[1m\u001b[33mExecute from the command line\u001b[39m\u001b[0m\u001b[24m\n" +
                                    "\n      Run in windows\n\n\u001b[32m    node api/node-local.js source:\"c:\\myDi" +
                                    "rectory\" readmethod:\"subdirectory\" diff:\"c:\\myOtherDirectory\"\u001b[39m\n" +
                                    "\n      Run in Linux and OSX\n\n\u001b[32m    node api/node-local.js source:\"my" +
                                    "Directory\" mode:\"beautify\" readmethod:\"subdirectory\" output:\"path/to/outpu" +
                                    "tDirectory\"\u001b[39m\n\n      To see a \u001b[3m\u001b[33mman\u001b[39m\u001b[" +
                                    "0m page provide no arguments or these: help, man, manual\n\n\u001b[32m    node a" +
                                    "pi/node-local.js h\u001b[39m\n\u001b[32m    node api/node-local.js help\u001b[39" +
                                    "m\n\u001b[32m    node api/node-local.js man\u001b[39m\n\u001b[32m    node api/no" +
                                    "de-local.js manual\u001b[39m\n\n      To see only the version number supply only" +
                                    " \u001b[3m\u001b[33mv\u001b[39m\u001b[0m or \u001b[3m\u001b[33mversion\u001b[39m" +
                                    "\u001b[0m as an\n      argument:\n\n\u001b[32m    node api/node-local.js v\u001b" +
                                    "[39m\n\u001b[32m    node api/node-local.js version\u001b[39m\n\n      To see a l" +
                                    "ist of current settings on the console supply \u001b[3m\u001b[33mlist\u001b[39m" +
                                    "\u001b[0m as an\n      argument:\n\n\u001b[32m    node api/node-local.js l\u001b" +
                                    "[39m\n\u001b[32m    node api/node-local.js list\u001b[39m\n\n    \u001b[4m\u001b" +
                                    "[1m\u001b[33mSet configurations with a **.prettydiffrc** file.\u001b[39m\u001b[0" +
                                    "m\u001b[24m\n\n      Pretty Diff will first look for a .prettydiffrc file from t" +
                                    "he\n      current directory in the command prompt. If the .prettydiffrc is not\n" +
                                    "      present in the current directory it will then look for it in the\n      ap" +
                                    "plication's directory.\n\n      The .prettydiffrc first checks for JSON format. " +
                                    "This allows a\n      simple means of defining options in a file. It also allows " +
                                    "a JavaScript\n      application format, (\u001b[36mhttp://prettydiff.com/.pretty" +
                                    "diffrc\u001b[39m), so that options\n      can be set conditionally.\n\n  \u001b[" +
                                    "4m\u001b[1m\u001b[32mRun in a web browser with api/dom.js\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n\n    Please feel free to use index.xhtml file to supplement dom.js." +
                                    "\n    Otherwise, dom.js requires supplemental assistance to map DOM nodes from a" +
                                    "n\n    HTML source.  dom.js is fault tolerant so nodes mapped to the supplied\n " +
                                    "   index.xhtml don't need to be supported from custom HTML.\n\n    To run Pretty" +
                                    " Diff using dom.js include the following two script tags\n    and bind the globa" +
                                    "l.prettydiff.pd.recycle(), function to the executing\n    event.  Please refer t" +
                                    "o index.xhtml for an HTML example and\n    documentation.xhtml for option and ex" +
                                    "ecution information.\n\n\u001b[32m    <script src=\"lib/global.js\" type=\"appli" +
                                    "cation/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"lib/languag" +
                                    "e.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b[32m    <scrip" +
                                    "t src=\"lib/options.js\" type=\"application/javascript\"></script>\u001b[39m\n" +
                                    "\u001b[32m    <script src=\"lib/finalFile.js\" type=\"application/javascript\"><" +
                                    "/script>\u001b[39m\n\u001b[32m    <script src=\"lib/safeSort.js\" type=\"applica" +
                                    "tion/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"ace/ace.js\" " +
                                    "type=\"application/javascript\"></script> **(optional)**\u001b[39m\n\u001b[32m  " +
                                    "  <script src=\"api/dom.js\" type=\"application/javascript\"></script>\u001b[39m" +
                                    "\n\u001b[32m    <script src=\"lib/csspretty.js\" type=\"application/javascript\"" +
                                    "></script>\u001b[39m\n\u001b[32m    <script src=\"lib/csvpretty.js\" type=\"appl" +
                                    "ication/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"lib/diffvi" +
                                    "ew.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b[32m    <scri" +
                                    "pt src=\"lib/jspretty.js\" type=\"application/javascript\"></script>\u001b[39m\n" +
                                    "\u001b[32m    <script src=\"lib/markuppretty.js\" type=\"application/javascript" +
                                    "\"></script>\u001b[39m\n\u001b[32m    <script src=\"prettydiff.js\" type=\"appli" +
                                    "cation/javascript\"></script>\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mExecute" +
                                    " with vanilla JS\u001b[39m\u001b[0m\u001b[24m\n\n\u001b[32m    var global = {}," +
                                    "\u001b[39m\n\u001b[32m        args   = {\u001b[39m\n\u001b[32m            source" +
                                    ": \"asdf\",\u001b[39m\n\u001b[32m            diff  : \"asdd\",\u001b[39m\n\u001b" +
                                    "[32m            lang  : \"text\"\u001b[39m\n\u001b[32m        },\u001b[39m\n" +
                                    "\u001b[32m        output = prettydiff(args);\u001b[39m\n\n  \u001b[4m\u001b[1m" +
                                    "\u001b[32mRun Pretty Diff in Atom, (https://atom.io/), code editor with the atom" +
                                    "-beautify, (https://atom.io/packages/atom-beautify), package.\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n\n  \u001b[4m\u001b[1m\u001b[32mRun the unit tests\u001b[39m\u001b[0" +
                                    "m\u001b[24m\n\n\u001b[32m    cd prettydiff\u001b[39m\n\u001b[32m    node test/li" +
                                    "nt.js\u001b[39m\n\n\u001b[4m\u001b[1m\u001b[36mLicense:\u001b[39m\u001b[0m\u001b" +
                                    "[24m\n\n   \u001b[1m@source\u001b[0m http://prettydiff.com/prettydiff.js\n\n   " +
                                    "\u001b[1m@documentation\u001b[0m English: http://prettydiff.com/documentation.xh" +
                                    "tml\n\n   \u001b[1m@licstart\u001b[0m The following is the entire license notice" +
                                    " for Pretty Diff.\n\n   This code may not be used or redistributed unless the fo" +
                                    "llowing\n   conditions are met:\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Pre" +
                                    "ttydiff created by Austin Cheney originally on 3 Mar 2009.\n    http://prettydif" +
                                    "f.com/\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m The use of diffview.js and pre" +
                                    "ttydiff.js must contain the following\n    copyright:\n  \u001b[1m\u001b[31m*" +
                                    "\u001b[39m\u001b[0m Copyright (c), 2007, Snowtide Informatics Systems, Inc. All " +
                                    "rights\n    reserved.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Redistributio" +
                                    "ns of source code must retain the above copyright\n      notice, this list of co" +
                                    "nditions and the following disclaimer.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b" +
                                    "[0m Redistributions in binary form must reproduce the above\n      copyright not" +
                                    "ice, this list of conditions and the following disclaimer i",
                            name         = "biddle_test_markdown_80";
                        if (er !== null) {
                            return apps.errout({error: er, name: name, stdout: stdout, time: humantime(true)});
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({error: stder, name: name, stdout: stdout, time: humantime(true)});
                        }
                        stdout = stdout
                            .replace(/\r\n/g, "\n")
                            .slice(0, 8192)
                            .replace(/(\\(\w+)?)$/, "");
                        if (stdout !== markdowntest) {
                            return diffFiles(name, stdout, markdowntest);
                        }
                        console.log(humantime(false) + " \u001b[32mmarkdown 80 test passed.\u001b[39m");
                        flag["80"] = true;
                        if (flag["60"] === true && flag["120"] === true) {
                            next();
                        }
                    });
                    node.child(childcmd + "markdown " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "READMEa.md 120 childtest", function biddle_test_markdown_120(er, stdout, stder) {
                        var markdowntest = "\nTry it online at http://prettydiff.com/, (\u001b[36mhttp://prettydiff.com/" +
                                    "\u001b[39m).\n\n\u001b[4m\u001b[1m\u001b[31mPretty Diff logo Pretty Diff\u001b[3" +
                                    "9m\u001b[0m\u001b[24m\n\nTravis CI Build, (\u001b[36mhttps://travis-ci.org/prett" +
                                    "ydiff/prettydiff\u001b[39m)\nAppVeyor Build, (\u001b[36mhttps://ci.appveyor.com/" +
                                    "project/prettydiff/prettydiff\u001b[39m)\nGitter,\n(\u001b[36mhttps://gitter.im/" +
                                    "prettydiff/prettydiff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&ut" +
                                    "m_content=badge\u001b[39m)\nTwitter Tweets,\n(\u001b[36mhttps://twitter.com/inte" +
                                    "nt/tweet?text=Handy%20web%20development%20tool:%20%20url=http%3A%2F%2Fprettydiff" +
                                    ".com\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mSummary\u001b[39m\u001b[0m\u001b[" +
                                    "24m\n\n  Language aware code comparison tool for several web based languages. It" +
                                    " also beautifies, minifies, and a few other\n  things.\n\n\u001b[4m\u001b[1m" +
                                    "\u001b[36mBenefits - see overview page, (http://prettydiff.com/overview.xhtml), " +
                                    "for more details\u001b[39m\u001b[0m\u001b[24m\n\n  \u001b[1m\u001b[31m*\u001b[39" +
                                    "m\u001b[0m ES6 / JS2015 ready\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m React J" +
                                    "SX format support, (\u001b[36mhttp://prettydiff.com/guide/react_jsx.xhtml\u001b[" +
                                    "39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m LESS, SCSS (Sass), and CSS suppo" +
                                    "rt\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Separate support for XML and HTML" +
                                    "\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Recursive command line directory dif" +
                                    "f, (\u001b[36mhttp://prettydiff.com/guide/diffcli.xhtml\u001b[39m)\n  \u001b[1m" +
                                    "\u001b[31m*\u001b[39m\u001b[0m JavaScript scope in colors, (\u001b[36mhttp://pre" +
                                    "ttydiff.com/guide/jshtml.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m Supports presets for popular styleguides, (\u001b[36mhttp://prettydiff" +
                                    ".com/guide/styleguide.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0" +
                                    "m Markup beautification with optional opt out, (\u001b[36mhttp://prettydiff.com/" +
                                    "guide/tag_ignore.xhtml\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Jav" +
                                    "aScript auto correction, (\u001b[36mhttp://prettydiff.com/guide/jscorrect.xhtml" +
                                    "\u001b[39m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Supports a ton of options" +
                                    ", (\u001b[36mhttp://prettydiff.com/documentation.php#function_properties\u001b[3" +
                                    "9m)\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Default beautifier, (\u001b[36mht" +
                                    "tps://atom.io/packages/atom-beautify/\u001b[39m), for several languages in Atom." +
                                    "io,\n    (\u001b[36mhttps://atom.io/\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mE" +
                                    "xecuting Pretty Diff\u001b[39m\u001b[0m\u001b[24m\n\n  \u001b[4m\u001b[1m\u001b[" +
                                    "32mRun with Node.js / CommonJS / RequireJS\u001b[39m\u001b[0m\u001b[24m\n\n    A" +
                                    " Node.js command line utility is provided by api/node-local.js.  This file can e" +
                                    "xecute in the following modes:\n\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m au" +
                                    "to - Determine if the resource is text, a file, or a directory and process as su" +
                                    "ch (except that\n      directories are processed with the subdirectory option)\n" +
                                    "    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m screen - code input is on the comman" +
                                    "d line and output is to the command line\n    \u001b[1m\u001b[31m*\u001b[39m" +
                                    "\u001b[0m filescreen - code input is in a file and the output is to the command " +
                                    "line\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m file - the input and the outpu" +
                                    "t reside in files\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m directory - every" +
                                    "thing in a directory is processed into a specified output directory except \".\"" +
                                    ", \"..\",\n      and subdirectories\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m" +
                                    " subdirectory - process the entire directory tree\n\n    \u001b[4m\u001b[1m" +
                                    "\u001b[33mExecute in the context of a NodeJS application\u001b[39m\u001b[0m" +
                                    "\u001b[24m\n\n      Add this code to your application\n\n\u001b[32m    var prett" +
                                    "ydiff = require(\"prettydiff\"),\u001b[39m\n\u001b[32m        args       = {" +
                                    "\u001b[39m\n\u001b[32m            source: \"asdf\",\u001b[39m\n\u001b[32m       " +
                                    "     diff  : \"asdd\",\u001b[39m\n\u001b[32m            lang  : \"text\"\u001b[3" +
                                    "9m\n\u001b[32m        },\u001b[39m\n\u001b[32m        output     = prettydiff(ar" +
                                    "gs);\u001b[39m\n\n    \u001b[4m\u001b[1m\u001b[33mExecute from the command line" +
                                    "\u001b[39m\u001b[0m\u001b[24m\n\n      Run in windows\n\n\u001b[32m    node api/" +
                                    "node-local.js source:\"c:\\myDirectory\" readmethod:\"subdirectory\" diff:\"c:" +
                                    "\\myOtherDirectory\"\u001b[39m\n\n      Run in Linux and OSX\n\n\u001b[32m    no" +
                                    "de api/node-local.js source:\"myDirectory\" mode:\"beautify\" readmethod:\"subdi" +
                                    "rectory\" output:\"path/to/outputDirectory\"\u001b[39m\n\n      To see a \u001b[" +
                                    "3m\u001b[33mman\u001b[39m\u001b[0m page provide no arguments or these: help, man" +
                                    ", manual\n\n\u001b[32m    node api/node-local.js h\u001b[39m\n\u001b[32m    node" +
                                    " api/node-local.js help\u001b[39m\n\u001b[32m    node api/node-local.js man" +
                                    "\u001b[39m\n\u001b[32m    node api/node-local.js manual\u001b[39m\n\n      To se" +
                                    "e only the version number supply only \u001b[3m\u001b[33mv\u001b[39m\u001b[0m or" +
                                    " \u001b[3m\u001b[33mversion\u001b[39m\u001b[0m as an argument:\n\n\u001b[32m    " +
                                    "node api/node-local.js v\u001b[39m\n\u001b[32m    node api/node-local.js version" +
                                    "\u001b[39m\n\n      To see a list of current settings on the console supply " +
                                    "\u001b[3m\u001b[33mlist\u001b[39m\u001b[0m as an argument:\n\n\u001b[32m    node" +
                                    " api/node-local.js l\u001b[39m\n\u001b[32m    node api/node-local.js list\u001b[" +
                                    "39m\n\n    \u001b[4m\u001b[1m\u001b[33mSet configurations with a **.prettydiffrc" +
                                    "** file.\u001b[39m\u001b[0m\u001b[24m\n\n      Pretty Diff will first look for a" +
                                    " .prettydiffrc file from the current directory in the command prompt. If\n      " +
                                    "the .prettydiffrc is not present in the current directory it will then look for " +
                                    "it in the application's directory.\n\n      The .prettydiffrc first checks for J" +
                                    "SON format. This allows a simple means of defining options in a file.\n      It " +
                                    "also allows a JavaScript application format, (\u001b[36mhttp://prettydiff.com/.p" +
                                    "rettydiffrc\u001b[39m), so that options can be set\n      conditionally.\n\n  " +
                                    "\u001b[4m\u001b[1m\u001b[32mRun in a web browser with api/dom.js\u001b[39m\u001b" +
                                    "[0m\u001b[24m\n\n    Please feel free to use index.xhtml file to supplement dom." +
                                    "js.  Otherwise, dom.js requires supplemental\n    assistance to map DOM nodes fr" +
                                    "om an HTML source.  dom.js is fault tolerant so nodes mapped to the supplied\n  " +
                                    "  index.xhtml don't need to be supported from custom HTML.\n\n    To run Pretty " +
                                    "Diff using dom.js include the following two script tags and bind the\n    global" +
                                    ".prettydiff.pd.recycle(), function to the executing event.  Please refer to inde" +
                                    "x.xhtml for an HTML example\n    and documentation.xhtml for option and executio" +
                                    "n information.\n\n\u001b[32m    <script src=\"lib/global.js\" type=\"application" +
                                    "/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"lib/language.js\"" +
                                    " type=\"application/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=" +
                                    "\"lib/options.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b[3" +
                                    "2m    <script src=\"lib/finalFile.js\" type=\"application/javascript\"></script>" +
                                    "\u001b[39m\n\u001b[32m    <script src=\"lib/safeSort.js\" type=\"application/jav" +
                                    "ascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"ace/ace.js\" type=\"a" +
                                    "pplication/javascript\"></script> **(optional)**\u001b[39m\n\u001b[32m    <scrip" +
                                    "t src=\"api/dom.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b" +
                                    "[32m    <script src=\"lib/csspretty.js\" type=\"application/javascript\"></scrip" +
                                    "t>\u001b[39m\n\u001b[32m    <script src=\"lib/csvpretty.js\" type=\"application/" +
                                    "javascript\"></script>\u001b[39m\n\u001b[32m    <script src=\"lib/diffview.js\" " +
                                    "type=\"application/javascript\"></script>\u001b[39m\n\u001b[32m    <script src=" +
                                    "\"lib/jspretty.js\" type=\"application/javascript\"></script>\u001b[39m\n\u001b[" +
                                    "32m    <script src=\"lib/markuppretty.js\" type=\"application/javascript\"></scr" +
                                    "ipt>\u001b[39m\n\u001b[32m    <script src=\"prettydiff.js\" type=\"application/j" +
                                    "avascript\"></script>\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mExecute with va" +
                                    "nilla JS\u001b[39m\u001b[0m\u001b[24m\n\n\u001b[32m    var global = {},\u001b[39" +
                                    "m\n\u001b[32m        args   = {\u001b[39m\n\u001b[32m            source: \"asdf" +
                                    "\",\u001b[39m\n\u001b[32m            diff  : \"asdd\",\u001b[39m\n\u001b[32m    " +
                                    "        lang  : \"text\"\u001b[39m\n\u001b[32m        },\u001b[39m\n\u001b[32m  " +
                                    "      output = prettydiff(args);\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mRun " +
                                    "Pretty Diff in Atom, (https://atom.io/), code editor with the atom-beautify, (ht" +
                                    "tps://atom.io/packages/atom-beautify), package.\u001b[39m\u001b[0m\u001b[24m\n\n" +
                                    "  \u001b[4m\u001b[1m\u001b[32mRun the unit tests\u001b[39m\u001b[0m\u001b[24m\n" +
                                    "\n\u001b[32m    cd prettydiff\u001b[39m\n\u001b[32m    node test/lint.js\u001b[3" +
                                    "9m\n\n\u001b[4m\u001b[1m\u001b[36mLicense:\u001b[39m\u001b[0m\u001b[24m\n\n   " +
                                    "\u001b[1m@source\u001b[0m http://prettydiff.com/prettydiff.js\n\n   \u001b[1m@do" +
                                    "cumentation\u001b[0m English: http://prettydiff.com/documentation.xhtml\n\n   " +
                                    "\u001b[1m@licstart\u001b[0m The following is the entire license notice for Prett" +
                                    "y Diff.\n\n   This code may not be used or redistributed unless the following\n " +
                                    "  conditions are met:\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m Prettydiff cr" +
                                    "eated by Austin Cheney originally on 3 Mar 2009. http://prettydiff.com/\n  " +
                                    "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m The use of diffview.js and prettydiff.js" +
                                    " must contain the following copyright:\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0" +
                                    "m Copyright (c), 2007, Snowtide Informatics Systems, Inc. All rights reserved.\n" +
                                    "    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Redistributions of source code must " +
                                    "retain the above copyright notice, this list of conditions and the\n      follow" +
                                    "ing disclaimer.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m Redistributions in " +
                                    "binary form must reproduce the above copyright notice, this list of conditions a" +
                                    "nd\n      the following disclaimer in the documentation and/or other materials p" +
                                    "rovided with the distribution.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b",
                            name         = "biddle_test_markdown_120";
                        if (er !== null) {
                            return apps.errout({error: er, name: name, stdout: stdout, time: humantime(true)});
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({error: stder, name: name, stdout: stdout, time: humantime(true)});
                        }
                        stdout = stdout
                            .replace(/\r\n/g, "\n")
                            .slice(0, 8192)
                            .replace(/(\\(\w+)?)$/, "");
                        if (stdout !== markdowntest) {
                            return diffFiles(name, stdout, markdowntest);
                        }
                        console.log(humantime(false) + " \u001b[32mmarkdown 120 test passed.\u001b[39m");
                        flag["120"] = true;
                        if (flag["60"] === true && flag["80"] === true) {
                            next();
                        }
                    });
                },
                moduleInstall: function biddle_test_moduleInstall() {
                    var dateobj  = new Date(),
                        day      = (dateobj.getDate() > 9)
                            ? "" + dateobj.getDate()
                            : "0" + dateobj.getDate(),
                        month    = (dateobj.getMonth() > 8)
                            ? "" + (dateobj.getMonth() + 1)
                            : "0" + (dateobj.getMonth() + 1),
                        date     = Number("" + dateobj.getFullYear() + month + day),
                        ind      = 0,
                        flag     = {
                            apps  : false,
                            jslint: false,
                            modout: false,
                            today : false
                        },
                        today    = require(data.abspath + "today.js"),
                        editions = function biddle_test_moduleInstall_editionsInit() {
                            return;
                        },
                        handler  = function biddle_test_moduleInstall_handler() {
                            var mod = keys[ind];
                            modules[keys[ind]].name = "\u001b[32m" + modules[keys[ind]].name + "\u001b[39m";
                            if (modules[keys[ind]].name.length > longname) {
                                longname = modules[keys[ind]].name.length;
                            }
                            node
                                .fs
                                .stat(modules[mod].dir, function biddle_test_moduleInstall_handler_stat(erstat, stats) {
                                    var add = function biddle_test_moduleInstall_handler_stat_add() {
                                        console.log("Adding " + modules[mod].name);
                                        node.child("git submodule add " + modules[mod].repo, function biddle_test_moduleInstall_handler_stat_add_submodule(era, stdouta, stdoutera) {
                                            if (era !== null && era.toString().indexOf("already exists in the index") < 0) {
                                                return apps.errout({error: era, name: "biddle_test_moduleInstall_handler_stat_add_submodule", stdout: stdouta, time: humantime(true)});
                                            }
                                            if (stdoutera !== null && stdoutera !== "" && stdoutera.indexOf("Cloning into '") < 0 && stdoutera.indexOf("already exists in the index") < 0) {
                                                return apps.errout({error: stdoutera, name: "biddle_test_moduleInstall_handler_stat_add_submodule", stdout: stdouta, time: humantime(true)});
                                            }
                                            node
                                                .child("git clone " + modules[mod].repo, function biddle_test_moduleInstall_handler_stat_add_submodule_clone(erb, stdoutb, stdouterb) {
                                                    if (erb !== null) {
                                                        return apps.errout({error: erb, name: "biddle_test_moduleInstall_handler_stat_add_submodule_clone", stdout: stdoutb, time: humantime(true)});
                                                    }
                                                    if (stdouterb !== null && stdouterb !== "" && stdouterb.indexOf("Cloning into '") < 0) {
                                                        return apps.errout({error: stdouterb, name: "biddle_test_moduleInstall_handler_stat_add_submodule_clone", stdout: stdoutb, time: humantime(true)});
                                                    }
                                                    ind += 1;
                                                    editions(mod, true, ind);
                                                    return stdoutb;
                                                });
                                            return stdouta;
                                        });
                                    };
                                    if (erstat !== null && erstat !== undefined) {
                                        if (erstat.toString().indexOf("Error: ENOENT: no such file or directory, stat '") === 0) {
                                            return add();
                                        }
                                        return apps.errout({error: erstat, name: "biddle_test_moduleInstall_handler_stat", time: humantime(true)});
                                    }
                                    if (stats.isDirectory() === true) {
                                        return node
                                            .fs
                                            .readdir(modules[mod].dir, function biddle_test_moduleInstall_handler_stat_readdir(direrr, files) {
                                                if (typeof direrr === "string") {
                                                    return apps.errout({error: direrr, name: "biddle_test_moduleInstall_handler_stat_readdir", time: humantime(true)});
                                                }
                                                ind += 1;
                                                if (files.length < 1) {
                                                    apps.rmrecurse(modules[mod].dir, add);
                                                } else {
                                                    editions(mod, false);
                                                }
                                            });
                                    }
                                    add();
                                });
                        };
                    editions = function biddle_test_moduleInstall_editions(appName, cloned) {
                        var modout = function biddle_test_moduleInstall_editions_modout() {
                                var x   = 0,
                                    len = keys.length;
                                console.log("Installed submodule versions");
                                console.log("----------------------------");
                                for (x = 0; x < len; x += 1) {
                                    modules[keys[x]].edition(modules[keys[x]]);
                                }
                                next();
                            },
                            submod = function biddle_test_moduleInstall_editions_submod(output) {
                                var appFile        = modules[appName].dir + node.path.sep + modules[appName].file,
                                    jslintcomplete = function biddle_test_moduleInstall_editions_submod_jslintcomplete() {
                                        modules.jslint.app = require(appFile);
                                        flag.jslint        = true;
                                        if (ind === keys.length) {
                                            if (flag.today === true && flag.modout === false) {
                                                modout();
                                            } else {
                                                if (output === true) {
                                                    console.log("All submodules configured.");
                                                }
                                                flag.apps = true;
                                            }
                                        }
                                    };
                                if (appName === "jslint") {
                                    node
                                        .fs
                                        .readFile(appFile, "utf8", function biddle_test_moduleInstall_editions_submod_lintread(erread, data) {
                                            if (erread !== null && erread !== undefined) {
                                                apps.errout({error: erread, name: "biddle_test_moduleInstall_editions_lintread", time: humantime(true)});
                                            }
                                            if (data.slice(data.length - 30).indexOf("\nmodule.exports = jslint;") < 0) {
                                                data = data + "\nmodule.exports = jslint;";
                                                node
                                                    .fs
                                                    .writeFile(appFile, data, "utf8", function biddle_test_moduleInstall_editions_submod_lintread_lintwrite(erwrite) {
                                                        if (erwrite !== null && erwrite !== undefined) {
                                                            apps.errout({error: erwrite, name: "biddle_test_moduleInstall_editions_lintread_lintwrite", time: humantime(true)});
                                                        }
                                                        jslintcomplete();
                                                    });
                                            } else {
                                                jslintcomplete();
                                            }
                                        });
                                } else {
                                    modules[appName].app = require(appFile);
                                    if (ind === keys.length && flag.jslint === true) {
                                        if (flag.today === true) {
                                            flag.modout = true;
                                            modout();
                                        } else {
                                            if (output === true) {
                                                console.log("All submodules configured.");
                                            }
                                            flag.apps = true;
                                        }
                                    }
                                }
                            },
                            each   = function biddle_test_moduleInstall_editions_each(val, idx) {
                                appName = val;
                                ind     = idx + 1;
                                submod(false);
                            };
                        if (ind === keys.length) {
                            if (today !== date) {
                                ind = 0;
                                node
                                    .fs
                                    .writeFile("today.js", "/\u002aglobal module\u002a/(function () {\"use strict\";var today=" + date + ";module.exports=today;}());", function biddle_test_moduleInstall_editions_writeToday(werr) {
                                        if (werr !== null && werr !== undefined) {
                                            apps.errout({error: werr, name: "biddle_test_moduleInstall_editions_writeToday", time: humantime(true)});
                                        }
                                        if (cloned === true) {
                                            console.log("Submodules downloaded.");
                                        } else {
                                            console.log("Submodules checked for updates.");
                                        }
                                        if (flag.apps === true) {
                                            modout();
                                        } else {
                                            console.log("Checked for new versions of submodules.");
                                            flag.today = true;
                                        }
                                    });
                                if (cloned === true) {
                                    node
                                        .child("git submodule init", function biddle_test_moduleInstall_editions_init(erc, stdoutc, stdouterc) {
                                            if (erc !== null) {
                                                apps.errout({error: erc, name: "biddle_test_moduleInstall_editions_init", stdout: stdoutc, time: humantime(true)});
                                            }
                                            if (stdouterc !== null && stdouterc !== "" && stdouterc.indexOf("Cloning into '") < 0 && stdouterc.indexOf("From ") < 0) {
                                                apps.errout({error: stdouterc, name: "biddle_test_moduleInstall_editions_init", stdout: stdoutc, time: humantime(true)});
                                            }
                                            node
                                                .child("git submodule update", function biddle_test_moduleInstall_editions_init_update(erd, stdoutd, stdouterd) {
                                                    if (erd !== null) {
                                                        apps.errout({error: erd, name: "biddle_test_moduleInstall_editions_init_update", stdout: stdoutd, time: humantime(true)});
                                                    }
                                                    if (stdouterd !== null && stdouterd !== "" && stdouterd.indexOf("Cloning into '") < 0 && stdouterd.indexOf("From ") !== 0) {
                                                        apps.errout({error: stdouterd, name: "biddle_test_moduleInstall_editions_init_update", stdout: stdoutd, time: humantime(true)});
                                                    }
                                                    if (flag.today === false) {
                                                        console.log("Submodules downloaded.");
                                                    }
                                                    keys.forEach(each);
                                                    return stdoutd;
                                                });
                                            return stdoutc;
                                        });
                                } else {
                                    node
                                        .child("git submodule foreach git pull origin master", function biddle_test_moduleInstall_editions_pull(errpull, stdoutpull, stdouterpull) {
                                            if (errpull !== null) {
                                                if (errpull.toString().indexOf("fatal: no submodule mapping found in .gitmodules for path ") > 0) {
                                                    console.log("No access to GitHub. Proceeding assuming submodules were previously installed.");
                                                    flag.apps = true;
                                                    return keys.forEach(each);
                                                }
                                                apps.errout({error: errpull, name: "biddle_test_moduleInstall_editions_pull", stdout: stdoutpull, time: humantime(true)});
                                            }
                                            if (stdouterpull !== null && stdouterpull !== "" && stdouterpull.indexOf("Cloning into '") < 0 && stdouterpull.indexOf("From ") < 0 && stdouterpull.indexOf("fatal: no submodule mapping found in .gitmodules for path ") < 0) {
                                                apps.errout({error: stdouterpull, name: "biddle_test_moduleInstall_editions_pull", stdout: stdoutpull, time: humantime(true)});
                                            }
                                            if (flag.today === false) {
                                                console.log("Submodules checked for updates.");
                                            }
                                            keys.forEach(each);
                                            return stdoutpull;
                                        });
                                }
                            } else {
                                flag.today = true;
                                console.log("Running prior installed modules.");
                            }
                        } else {
                            handler(ind);
                        }
                        submod(true);
                    };
                    process.chdir(__dirname);
                    apps.rmrecurse(testpath, function biddle_test_moduleInstall_rmrecurse() {
                        apps
                            .makedir(testpath, function biddle_test_moduleInstall_makedir() {
                                handler(0);
                            });
                    });
                },
                publish      : function biddle_test_publish() {
                    node
                        .child(childcmd + "publish " + data.abspath + "test" + node.path.sep + "biddletesta childtest", function biddle_test_publish_child(er, stdout, stder) {
                            var publishtest = "File publications/biddletesta/biddletesta_\u001b[1m\u001b[36mxxx.zip\u001b[39m" +
                                        "\u001b[0m written at \u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.\nFile publ" +
                                        "ications/biddletesta/biddletesta_\u001b[1m\u001b[36mlatest.zip\u001b[39m\u001b[0" +
                                        "m written at \u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.\nFile publications" +
                                        "/biddletesta/biddletesta_\u001b[1m\u001b[36mmin_xxx.zip\u001b[39m\u001b[0m writt" +
                                        "en at \u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.\nFile publications/biddle" +
                                        "testa/biddletesta_\u001b[1m\u001b[36mmin_latest.zip\u001b[39m\u001b[0m written a" +
                                        "t \u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.\nFile publications/biddletest" +
                                        "a/biddletesta_\u001b[1m\u001b[36mprod_xxx.zip\u001b[39m\u001b[0m written at " +
                                        "\u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.\nFile publications/biddletesta/" +
                                        "biddletesta_\u001b[1m\u001b[36mprod_latest.zip\u001b[39m\u001b[0m written at " +
                                        "\u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.",
                                outputs     = stdout
                                    .replace(/(\s+)$/, "")
                                    .replace("\r\n", "\n")
                                    .split("\n")
                                    .sort(function biddle_test_publish_child_outSort(a, b) {
                                        if (a > b) {
                                            return 1;
                                        }
                                        return -1;
                                    }),
                                output      = "",
                                abspath     = new RegExp(data.abspath.replace(/\\/g, "\\\\"), "g");
                            if (er !== null) {
                                apps.errout({error: er, name: "biddle_test_publish_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                apps.errout({error: stder, name: "biddle_test_publish_child", stdout: stdout, time: humantime(true)});
                            }
                            node
                                .fs
                                .stat(data.abspath + "temp", function biddle_test_publish_child_statTemp(errtemp) {
                                    if (errtemp === null) {
                                        return apps.errout({error: "Directory 'temp' from publish operation should have been removed.", name: "biddle_test_publish_child_statTemp", time: humantime(true)});
                                    }
                                    if (errtemp.toString().indexOf("no such file or directory") < 0) {
                                        return apps.errout({error: errtemp, name: "biddle_test_publish_child_statTemp", time: humantime(true)});
                                    }
                                    outputs
                                        .forEach(function biddle_test_publish_child_statTemp_formatOutput(value, index, array) {
                                            var val = value.slice(value.indexOf("publications"));
                                            array[index] = "File " + val;
                                        });
                                    output = outputs.join("\n");
                                    output = output.replace(/\\/g, "/");
                                    output = output
                                        .replace(/\d+\.\d+\.\d+\.zip/g, "xxx.zip")
                                        .replace(/\u001b\[32m\d+(,\d+)*/g, "\u001b[32mxxx")
                                        .replace(abspath, "");
                                    if (output !== publishtest) {
                                        return diffFiles("biddle_test_publish_child", output, publishtest);
                                    }
                                    node
                                        .fs
                                        .readFile(data.abspath + "published.json", "utf8", function biddle_test_publish_child_statTemp_readJSON(err, fileData) {
                                            var jsondata = {},
                                                pub      = data.abspath + "publications" + node.path.sep + "biddletesta";
                                            if (err !== null && err !== undefined) {
                                                return apps.errout({error: err, name: "biddle_test_publish_child_statTemp_readJSON", stdout: stdout, time: humantime(true)});
                                            }
                                            jsondata = JSON.parse(fileData);
                                            if (jsondata.biddletesta === undefined) {
                                                return apps.errout({error: "No biddletesta property in published.json file.", name: "biddle_test_publish_child_statTemp_readJSON", stdout: stdout, time: humantime(true)});
                                            }
                                            node
                                                .fs
                                                .readdir(pub, function biddle_test_publish_child_statTemp_readJSON_readdir(errr, files) {
                                                    var filetest = "biddletesta_v.hash,biddletesta_v.zip,biddletesta_latest.hash,biddletesta_latest." +
                                                                "zip,biddletesta_min_v.hash,biddletesta_min_v.zip,biddletesta_min_latest.hash,bid" +
                                                                "dletesta_min_latest.zip,biddletesta_prod_v.hash,biddletesta_prod_v.zip,biddletes" +
                                                                "ta_prod_latest.hash,biddletesta_prod_latest.zip",
                                                        filelist = files.sort(function biddle_test_publish_child_statTemp_readJSON_readdir_outSort(a, b) {
                                                            if (a > b) {
                                                                return 1;
                                                            }
                                                            return -1;
                                                        })
                                                            .join(",")
                                                            .replace(/_\d+\.\d+\.\d+\.((zip)|(hash))/g, function biddle_test_publish_child_statTemp_readJSON_readdir_replace(x) {
                                                                if (x.indexOf("zip") > 0) {
                                                                    return "_v.zip";
                                                                }
                                                                return "_v.hash";
                                                            }),
                                                        stats    = {},
                                                        statfile = function biddle_test_publish_child_statTemp_readJSON_readdir_statfile(index) {
                                                            stats[files[index]] = false;
                                                            node
                                                                .fs
                                                                .stat(pub + node.path.sep + files[index], function biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback(errs, statobj) {
                                                                    if (errs !== null) {
                                                                        return apps.errout({error: errs, name: "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback", stdout: stdout, time: humantime(true)});
                                                                    }
                                                                    if (files[index].indexOf(".hash") === files[index].length - 5 && statobj.size !== 128) {
                                                                        return apps.errout({
                                                                            error : "Expected hash file " + files[index] + " to be file size 128.",
                                                                            name  : "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback",
                                                                            stdout: stdout,
                                                                            time  : humantime(true)
                                                                        });
                                                                    }
                                                                    if (files[index].indexOf(".zip") === files[index].length - 4 && statobj.size > 20000) {
                                                                        return apps.errout({
                                                                            error : "Zip file " + files[index] + " is too big at " + apps.commas(statobj.size) + ".",
                                                                            name  : "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback",
                                                                            stdout: stdout,
                                                                            time  : humantime(true)
                                                                        });
                                                                    }
                                                                    console.log(humantime(false) + " " + files[index] + " present at size " + apps.commas(statobj.size) + " bytes.");
                                                                    stats[files[index]] = true;
                                                                    if (stats[files[0]] === true && stats[files[1]] === true && stats[files[2]] === true && stats[files[3]] === true && stats[files[4]] === true && stats[files[5]] === true && stats[files[6]] === true && stats[files[7]] === true && stats[files[8]] === true && stats[files[9]] === true && stats[files[10]] === true && stats[files[11]] === true) {
                                                                        console.log(humantime(false) + " \u001b[32mpublish test passed.\u001b[39m");
                                                                        node.child(childcmd + "publish " + data.abspath + "test" + node.path.sep + "biddletesta childtest", function biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish(erx, stdoutx, stderx) {
                                                                            var publishagain = "\u001b[1m\u001b[36mFunction:\u001b[39m\u001b[0m biddle_publish_execution\n\u001b" +
                                                                                             "[1m\u001b[31mError:\u001b[39m\u001b[0m Attempted to publish biddletesta over exi" +
                                                                                             "sting version",
                                                                                stack        = [];
                                                                            if (erx !== null) {
                                                                                if (typeof erx.stack === "string") {
                                                                                    stack = erx
                                                                                        .stack
                                                                                        .split(" at ");
                                                                                }
                                                                                if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:2") < 0) {
                                                                                    return apps.errout({error: erx, name: "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish", stdout: stdout, time: humantime(true)});
                                                                                }
                                                                            }
                                                                            if (stderx !== null && stderx !== "") {
                                                                                return apps.errout({error: stderx, name: "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish", stdout: stdout, time: humantime(true)});
                                                                            }
                                                                            stdoutx = stdoutx
                                                                                .replace("\r\n", "\n")
                                                                                .replace(/(\u0020\d+\.\d+\.\d+\s*)$/, "");
                                                                            if (stdoutx !== publishagain) {
                                                                                return diffFiles("biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish", stdoutx, publishagain);
                                                                            }
                                                                            node
                                                                                .fs
                                                                                .stat(data.abspath + "temp", function biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish_statTemp(errtemp) {
                                                                                    if (errtemp === null) {
                                                                                        return apps.errout({
                                                                                            error: "Directory 'temp' from publish operation should have been removed.",
                                                                                            name : "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish_st" +
                                                                                                      "atTemp",
                                                                                            time : humantime(true)
                                                                                        });
                                                                                    }
                                                                                    if (errtemp.toString().indexOf("no such file or directory") < 0) {
                                                                                        return apps.errout({
                                                                                            error: errtemp,
                                                                                            name : "biddle_test_publish_child_statTemp_readJSON_readdir_statfile_statback_publish_st" +
                                                                                                      "atTemp",
                                                                                            time : humantime(true)
                                                                                        });
                                                                                    }
                                                                                    console.log(humantime(false) + " \u001b[32mRedundant publish test (error messaging) passed.\u001b[39m");
                                                                                    next();
                                                                                });
                                                                        });
                                                                    }
                                                                });
                                                        };
                                                    if (errr !== null) {
                                                        return apps.errout({error: errr, name: "biddle_test_publish_child_statTemp_readJSON_readdir", stdout: stdout, time: humantime(true)});
                                                    }
                                                    if (filelist !== filetest) {
                                                        return diffFiles("biddle_test_publish_child_statTemp_readJSON_readdir", filelist, filetest);
                                                    }
                                                    statfile(0);
                                                    statfile(1);
                                                    statfile(2);
                                                    statfile(3);
                                                    statfile(4);
                                                    statfile(5);
                                                    statfile(6);
                                                    statfile(7);
                                                    statfile(8);
                                                    statfile(9);
                                                    statfile(10);
                                                    statfile(11);
                                                });
                                            return stdout;
                                        });
                                });
                        });
                },
                unpublish    : function biddle_test_unpublish() {
                    node
                        .child(childcmd + "unpublish biddletesta childtest", function biddle_test_unpublish_child(er, stdout, stder) {
                            var unpubtest = "App \u001b[36mbiddletesta\u001b[39m is unpublished.";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_unpublish_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_unpublish_child", stdout: stdout, time: humantime(true)});
                            }
                            stdout = stdout.replace(/(\s+)$/, "");
                            if (stdout !== unpubtest) {
                                return diffFiles("biddle_test_unpublish_child", stdout, unpubtest);
                            }
                            if (data.published.biddletesta !== undefined) {
                                return apps.errout({error: "biddletesta property not removed from data.published object", name: "biddle_test_unpublish_child", stdout: stdout, time: humantime(true)});
                            }
                            node
                                .fs
                                .stat(data.abspath + "publications" + node.path.sep + "biddletesta", function biddle_test_unpublish_child_stat(err, stat) {
                                    if (err !== null && err.toString().indexOf("no such file or directory") < 0) {
                                        return apps.errout({error: err, name: "biddle_test_unpublish_child_stat", time: humantime(true)});
                                    }
                                    if (stat !== undefined && stat.isDirectory() === true) {
                                        return apps.errout({
                                            error : "publications" + node.path.sep + "biddletesta directory not deleted by unpublish command",
                                            name  : "biddle_test_unpublish_child_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    if (err.toString().indexOf("no such file or directory") > 0) {
                                        node
                                            .fs
                                            .readFile(data.abspath + "published.json", function biddle_test_unpublish_child_stat_readfile(erf, filedata) {
                                                var jsondata = {};
                                                if (erf !== null && erf !== undefined) {
                                                    return apps.errout({error: erf, name: "biddle_test_unpublish_child_stat_readfile", stdout: stdout, time: humantime(true)});
                                                }
                                                jsondata = JSON.parse(filedata);
                                                if (jsondata.biddletesta !== undefined) {
                                                    return apps.errout({error: "biddletesta property still present in published.json file", name: "biddle_test_unpublish_child_stat_readfile", stdout: stdout, time: humantime(true)});
                                                }
                                                console.log(humantime(false) + " \u001b[32munpublish test passed.\u001b[39m");
                                                node.child(childcmd + "unpublish biddletesta childtest", function biddle_test_unpublish_child_stat_readfile_again(erx, stdoutx, stderx) {
                                                    var unpubagain = "Attempted to unpublish \u001b[36mbiddletesta\u001b[39m which is \u001b[1m\u001b[" +
                                                                   "31mabsent\u001b[39m\u001b[0m from the list of published applications. Try using " +
                                                                   "the command \u001b[32mbiddle list published\u001b[39m.",
                                                        stack      = [];
                                                    if (erx !== null) {
                                                        if (typeof erx.stack === "string") {
                                                            stack = erx
                                                                .stack
                                                                .split(" at ");
                                                        }
                                                        if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:202:12)") < 0) {
                                                            return apps.errout({error: erx, name: "biddle_test_unpublish_child_stat_readfile_again", stdout: stdout, time: humantime(true)});
                                                        }
                                                    }
                                                    if (stderx !== null && stderx !== "") {
                                                        return apps.errout({error: stderx, name: "biddle_test_unpublish_child_stat_readfile_again", stdout: stdout, time: humantime(true)});
                                                    }
                                                    stdoutx = stdoutx.replace(/(\s+)$/, "");
                                                    if (stdoutx !== unpubagain) {
                                                        return diffFiles("biddle_test_unpublish_child_stat_readfile_again", stdoutx, unpubagain);
                                                    }
                                                    console.log(humantime(false) + " \u001b[32mRedundant unpublish test (error messaging) passed.\u001b[39m");
                                                    next();
                                                });
                                            });
                                    } else {
                                        return apps.errout({
                                            error : "directory publications" + node.path.sep + "biddletesta changed to something else and not deleted",
                                            name  : "biddle_test_unpublish_child_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                });
                        });
                },
                unzip        : function biddle_test_unzip() {
                    node
                        .child(childcmd + "unzip " + data.abspath + "unittest" + node.path.sep + "biddletesta.zip " + data.abspath + "unittest" + node.path.sep + "unzip childtest", function biddle_test_unzip_child(er, stdout, stder) {
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_unzip_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_unzip_child", stdout: stdout, time: humantime(true)});
                            }
                            node
                                .fs
                                .stat(testpath + node.path.sep + "unzip" + node.path.sep + "biddletesta.js", function biddle_test_unzip_child_stat(err, stat) {
                                    if (err !== null) {
                                        return apps.errout({error: err, name: "biddle_test_unzip_child_stat", stdout: stdout, time: humantime(true)});
                                    }
                                    if (stat.size < 10000) {
                                        return apps.errout({error: "\u001b[31munzip test failed.\u001b[39m.", name: "biddle_test_unzip_child_stat", stdout: stdout, time: humantime(true)});
                                    }
                                    console.log(humantime(false) + " \u001b[32mbiddletesta.js unzipped.\u001b[39m");
                                    node
                                        .fs
                                        .readdir(testpath + node.path.sep + "unzip", function biddle_test_unzip_child_stat_readDir(erd, files) {
                                            var count = 5;
                                            if (erd !== null) {
                                                return apps.errout({error: erd, name: "biddle_test_unzip_child_stat_readDir", stdout: stdout, time: humantime(true)});
                                            }
                                            if (files.length !== count) {
                                                return apps.errout({
                                                    error : "Expected " + count + " items unzipped, but there are " + files.length + ".",
                                                    name  : "biddle_test_unzip_child_stat_readDir",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(humantime(false) + " \u001b[32m" + count + " items unzipped.\u001b[39m");
                                            console.log(humantime(false) + " \u001b[32munzip test passed.\u001b[39m");
                                            next();
                                        });
                                    return stdout;
                                });
                        });
                },
                zip          : function biddle_test_zip() {
                    node
                        .child(childcmd + "zip " + data.abspath + "test" + node.path.sep + "biddletesta " + data.abspath + "unittest childtest", function biddle_test_zip_child(er, stdout, stder) {
                            var ziptest = "Zip file written: unittest" + node.path.sep + "biddletesta.zip";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_zip_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_zip_child", stdout: stdout, time: humantime(true)});
                            }
                            stdout = stdout
                                .replace(/(\s+)$/, "")
                                .replace(data.abspath, "");
                            if (stdout !== ziptest) {
                                return diffFiles("biddle_test_zip_child", stdout, ziptest);
                            }
                            node
                                .fs
                                .stat(testpath + node.path.sep + "biddletesta.zip", function biddle_test_zip_stat(err, stat) {
                                    if (err !== null) {
                                        return apps.errout({error: err, name: "biddle_test_zip_stat", stdout: stdout, time: humantime(true)});
                                    }
                                    if (stat.size > 20000) {
                                        return apps.errout({
                                            error : "Zip file is too large at " + apps.commas(stat.size) + " bytes.",
                                            name  : "biddle_test_zip_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    console.log(humantime(false) + " \u001b[32mzip test passed.\u001b[39m File " + data.abspath + "unittest" + node.path.sep + "biddletesta.zip written at " + apps.commas(stat.size) + " bytes.");
                                    next();
                                });
                        });
                }
            };
        next = function biddle_test_next() {
            if (phases.active === "moduleInstall") {
                process.chdir(data.cwd);
            }
            console.log("");
            if (order.length < 1) {
                return apps.rmrecurse(testpath, function biddle_test_next_rmdir() {
                    console.log("All tasks complete... Exiting clean!");
                    console.log(humantime(true));
                    process.exit(0);
                });
            }
            phases.active = order[0];
            phases[order[0]]();
            order.splice(0, 1);
        };
        next();
    };
    apps.unpublish   = function biddle_unpublish() {
        var app = data.published[data.input[2]];
        if (app === undefined) {
            return console.log("Attempted to unpublish \u001b[36m" + data.input[2] + "\u001b[39m which is \u001b[1m\u001b[31mabsent\u001b[39m\u001b[0m from the list o" +
                    "f published applications. Try using the command \u001b[32mbiddle list published" +
                    "\u001b[39m.");
        }
        apps
            .rmrecurse(app.directory, function biddle_unpublish_rmrecurse() {
                delete data.published[data.input[2]];
                apps.writeFile(JSON.stringify(data.published), data.abspath + "published.json", function biddle_unpublish_rmrecurse_writeFile() {
                    console.log("App \u001b[36m" + data.input[2] + "\u001b[39m is unpublished.");
                });
            });
    };
    apps.writeFile   = function biddle_writeFile(fileData, fileName, callback) {
        var callbacker = function biddle_writeFile_callbacker(size) {
            var colored = [];
            if (size > 0 && fileName.replace(data.abspath, "") !== "published.json" && fileName.replace(data.abspath, "") !== "installed.json") {
                colored                     = fileName.split(node.path.sep);
                colored[colored.length - 1] = colored[colored.length - 1].replace("_", "_\u001b[1m\u001b[36m");
                console.log("File " + colored.join(node.path.sep) + "\u001b[39m\u001b[0m written at \u001b[1m\u001b[32m" + apps.commas(size) + "\u001b[39m\u001b[0m bytes.");
            }
            callback(fileData);
        };
        node
            .fs
            .writeFile(fileName, fileData, function biddle_writeFile_callback(err) {
                if (err !== null) {
                    if (data.platform !== "win32" && data.command === "global" && err.toString().indexOf("EACCES: permission denied")) {
                        return apps.errout({
                            error: err.toString() + "\n\u001b[31m\u001b[1mThis command requires sudo access.\u001b[0m\u001b[39m Pleas" +
                                    "e try 'sudo node biddle global'.",
                            name : "biddle_writeFile_callback"
                        });
                    }
                    return apps.errout({error: err, name: "biddle_writeFile_callback"});
                }
                if (data.command === "get" || data.command === "publish") {
                    if (data.command === "publish") {
                        fileName = fileName.replace(".hash", ".zip");
                    }
                    node
                        .fs
                        .stat(fileName, function biddle_writeFile_callback_getstat(errstat, stat) {
                            if (errstat !== null) {
                                return apps.errout({error: errstat, name: "biddle_writeFile_callback_getstat"});
                            }
                            callbacker(stat.size);
                        });
                } else {
                    callbacker(0);
                }
            });
    };
    apps.zip         = function biddle_zip(callback, zippack) {
        var zipfile     = "",
            latestfile  = "",
            cmd         = "",
            latestcmd   = "",
            variantName = (zippack.name === "")
                ? ""
                : "_" + zippack.name,
            childfunc   = function biddle_zip_childfunc(zipfilename, zipcmd, writejson) {
                node
                    .child(zipcmd, function biddle_zip_childfunc_child(err, stdout, stderr) {
                        if (err !== null && stderr.toString().indexOf("No such file or directory") < 0) {
                            return apps.errout({error: err, name: "biddle_zip_childfunc_child"});
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "" && stderr.indexOf("No such file or directory") < 0) {
                            return apps.errout({error: stderr, name: "biddle_zip_childfunc_child"});
                        }
                        if (data.command === "install") {
                            console.log(stdout);
                        }
                        if (data.command === "zip" || data.command === "publish") {
                            process.chdir(data.cwd);
                        }
                        callback(zipfilename, writejson);
                        return stdout;
                    });
            };
        if (data.command === "publish" || data.command === "zip") {
            if (data.address.target.indexOf(node.path.sep + "publications") + 1 === data.address.target.length - 13) {
                data.address.target = data.address.target + data.packjson.name + node.path.sep;
            }
            if (data.command === "zip") {
                zipfile = data.address.target + data.fileName + ".zip";
            } else {
                zipfile = data.address.target + data
                    .packjson
                    .name
                    .toLowerCase() + variantName + "_" + data.packjson.version + ".zip";
            }
            if (data.platform === "win32") {
                cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compress" +
                        "ion.FileSystem'; [IO.Compression.ZipFile]::CreateFromDirectory('.', '" + apps.relToAbs(zipfile, false) + "'); }\"";
            } else {
                cmd = "zip -r9yq " + apps.relToAbs(zipfile, false) + " ." + node.path.sep + " *.[!.]";
            }
            if (data.command === "publish") {
                apps
                    .makedir(data.address.target, function biddle_zip_publish() {
                        var latestVersion = (function biddle_zip_publish_latestVersion() {
                            var ver = "",
                                sem = [],
                                cur = [],
                                len = 0,
                                a   = 0;
                            if (ver.indexOf("alpha") > -1 || ver.indexOf("beta") > -1) {
                                return false;
                            }
                            if (data.published[data.packjson.name].latest === "") {
                                return true;
                            }
                            ver = data.packjson.version;
                            sem = ver.split(".");
                            cur = data
                                .published[data.packjson.name]
                                .latest
                                .split(".");
                            len = (Math.max(sem, cur));
                            do {
                                if (isNaN(sem[a]) === false && isNaN(cur[a]) === false) {
                                    if (sem[a] > cur[a]) {
                                        return true;
                                    }
                                    if (cur[a] < sem[a]) {
                                        return false;
                                    }
                                }
                                if (sem[a] === undefined) {
                                    return true;
                                }
                                if (cur[a] === undefined) {
                                    return false;
                                }
                                if (isNaN(cur[a]) === true) {
                                    return false;
                                }
                                a += 1;
                            } while (a < len);
                            return true;
                        }());
                        process.chdir(zippack.location);
                        if (latestVersion === true) {
                            latestfile                                = zipfile.replace(data.packjson.version + ".zip", "latest.zip");
                            latestcmd                                 = cmd.replace(data.packjson.version + ".zip", "latest.zip");
                            data.published[data.packjson.name].latest = data.packjson.version;
                            childfunc(latestfile, latestcmd, false);
                        }
                        childfunc(zipfile, cmd, true);
                    });
            } else {
                apps
                    .makedir(data.input[2], function biddle_zip_makedir() {
                        process.chdir(data.input[2]);
                        childfunc(zipfile, cmd, false);
                    });
            }
        }
        if (data.command === "install" || data.command === "unzip") {
            if (data.platform === "win32") {
                cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compress" +
                        "ion.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" + data.input[2] + "', '" + data.address.target + "'); }\"";
            } else {
                cmd = "unzip -oq " + data.input[2] + " -d " + data.address.target;
            }
            apps
                .makedir(data.address.target, function biddle_zip_unzip() {
                    childfunc(data.input[2], cmd, false);
                });
        }
    };
    (function biddle_init() {
        var status    = {
                installed: false,
                published: false
            },
            comlist   = {
                get      : true,
                global   : true,
                hash     : true,
                help     : true,
                install  : true,
                list     : true,
                markdown : true,
                publish  : true,
                status   : true,
                test     : true,
                uninstall: true,
                unpublish: true,
                unzip    : true,
                zip      : true
            },
            valuetype = "",
            start     = function biddle_init_start() {
                if (data.command === "help" || data.command === "" || data.command === undefined || data.command === "?") {
                    apps.help();
                } else if (isNaN(data.command) === false) {
                    data.input[1] = "help";
                    data.input[2] = data.command;
                    data.command  = "help";
                    apps.help();
                } else if (comlist[data.command] === undefined) {
                    apps.errout({
                        error: "Unrecognized command: \u001b[31m" + data.command + "\u001b[39m.  Currently these commands are recognized:\r\n\r\n" + Object
                            .keys(comlist)
                            .join("\r\n") + "\r\n",
                        name : "biddle_init_start"
                    });
                } else {
                    if (data.input[2] === undefined && data.command !== "status" && data.command !== "list" && data.command !== "test" && data.command !== "global") {
                        if (data.command === "hash" || data.command === "markdown" || data.command === "unzip" || data.command === "zip") {
                            valuetype = "path to a local file";
                        } else if (data.command === "get" || data.command === "install" || data.command === "publish") {
                            valuetype = "URL address for a remote resource or path to a local file";
                        } else if (data.command === "uninstall" || data.command === "unpublish") {
                            valuetype = "known application name";
                        }
                        return apps.errout({
                            error: "Command \u001b[32m" + data.command + "\u001b[39m requires a " + valuetype + ".",
                            name : "biddle_init_start"
                        });
                    }
                    if (data.command === "get") {
                        apps
                            .get(data.input[2], function biddle_init_start_getback(filedata) {
                                apps
                                    .writeFile(filedata, data.address.target + data.fileName, function biddle_init_start_getback_callback() {
                                        return filedata;
                                    });
                            });
                    } else if (data.command === "markdown") {
                        apps.help();
                    } else if (data.command === "install") {
                        apps.install();
                    } else if (data.command === "list") {
                        apps.list();
                    } else if (data.command === "publish") {
                        apps.publish();
                    } else if (data.command === "unpublish") {
                        apps.unpublish();
                    } else if (data.command === "hash") {
                        apps
                            .hashCmd(data.input[2], "hashFile", function biddle_init_start_hash() {
                                console.log(data.hashFile);
                            });
                    } else if (data.command === "zip") {
                        apps
                            .zip(function biddle_init_start_zip(zipfile) {
                                return console.log("Zip file written: " + zipfile);
                            }, {
                                location: apps.relToAbs(data.input[2]),
                                name    : ""
                            });
                    } else if (data.command === "unzip") {
                        apps
                            .zip(function biddle_init_start_unzip(zipfile) {
                                return console.log("File " + zipfile + " unzipped to: " + data.address.target);
                            }, {
                                location: apps.relToAbs(data.input[2]),
                                name    : ""
                            });
                    } else if (data.command === "test") {
                        apps.test();
                    } else if (data.command === "global") {
                        apps.makeGlobal();
                    }
                }
            };
        data.input    = (function biddle_input() {
            var a     = [],
                b     = 0,
                c     = process.argv.length,
                paths = [];
            if (process.argv[0] === "sudo") {
                process
                    .argv
                    .splice(0, 1);
            }
            paths = process
                .argv[0]
                .split(node.path.sep);
            if (paths[paths.length - 1] === "node" || paths[paths.length - 1] === "node.exe") {
                b = 1;
            }
            do {
                a.push(process.argv[b]);
                b += 1;
            } while (b < c);
            if (a.length < 1) {
                a = ["", "", ""];
            }
            a[0] = a[0].toLowerCase();
            if (a[a.length - 1] === "childtest") {
                a.pop();
                data.childtest = true;
            }
            return a;
        }());
        data.command  = (data.input.length > 1)
            ? data
                .input[1]
                .toLowerCase()
            : "";
        data.abspath  = (function biddle_abspath() {
            var absarr = data
                .input[0]
                .split(node.path.sep);
            absarr.pop();
            if (absarr[absarr.length - 1] === "bin") {
                absarr.pop();
            }
            if (absarr[absarr.length - 1] !== "biddle") {
                absarr.push("biddle");
            }
            return absarr.join(node.path.sep) + node.path.sep;
        }());
        data.address  = (function biddle_address() {
            var addy = {
                downloads: data.abspath + "downloads" + node.path.sep,
                target   : ""
            };
            if (typeof data.input[3] === "string") {
                addy.target = data
                    .input[3]
                    .replace(/((\\|\/)+)$/, "") + node.path.sep;
            } else if (data.command === "publish") {
                addy.target = data.abspath + "publications" + node.path.sep;
            } else if (data.command === "install") {
                addy.target = data.abspath + "applications" + node.path.sep;
            }
            return addy;
        }());
        data.fileName = apps.getFileName();
        node
            .fs
            .readFile(data.abspath + "installed.json", "utf8", function biddle_init_installed(err, fileData) {
                var parsed = {};
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_init_installed"});
                }
                status.installed = true;
                parsed           = JSON.parse(fileData);
                data.installed   = parsed;
                if (status.published === true) {
                    start();
                }
            });
        node
            .fs
            .readFile(data.abspath + "published.json", "utf8", function biddle_init_published(err, fileData) {
                var parsed = {};
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_init_published"});
                }
                status.published = true;
                parsed           = JSON.parse(fileData);
                data.published   = parsed;
                if (status.installed === true) {
                    start();
                }
            });
    }());
}());
