/*jshint laxbreak: true*/
/*jslint node: true, for: true*/
(function biddle() {
    "use strict";
    var child     = require("child_process").exec,
        path      = require("path"),
        fs        = require("fs"),
        http      = require("http"),
        https     = require("https"),
        errout    = function biddle_errout(errData) {
            var error = (typeof errData.error !== "string" || errData.error.toString().indexOf("Error: ") === 0)
                ? errData.error
                : "Error: " + errData.error;
            console.log("Function: " + errData.name);
            console.log(error);
            process.exit(1);
        },
        input     = (function biddle_input() {
            var a     = [],
                b     = 0,
                c     = process.argv.length,
                paths = process
                    .argv[0]
                    .split(path.sep);
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
            return a;
        }()),
        data      = {
            abspath  : (function biddle_abspath() {
                var absarr = input[0].split(path.sep);
                absarr.pop();
                return absarr.join(path.sep) + path.sep;
            }()),
            address  : {},
            command  : (input.length > 1)
                ? input[1].toLowerCase()
                : "",
            fileName : "",
            hashFile : "",
            hashZip  : "",
            ignore   : [],
            installed: {},
            packjson : {},
            platform : process
                .platform
                .replace(/\s+/g, "")
                .toLowerCase(),
            published: {}
        },
        apps      = {
            commas    : function biddle_commas(number) {
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
            },
            getpjson  : function biddle_getpjson(callback) {
                var file = input[2].replace(/(\/|\\)$/, "") + path.sep + "package.json";
                fs.readFile(file, "utf8", function biddle_getpjson_readfile(err, fileData) {
                    if (err !== null && err !== undefined) {
                        if (err.toString().indexOf("no such file or directory") > 0) {
                            return errout({
                                error: "The package.json file is missing from " + input[2] + ". biddle cannot publish without a package.json file.",
                                name : "biddle_getpjson_readFile"
                            });
                        }
                        return errout({error: err, name: "biddle_getpjson_readFile"});
                    }
                    data.packjson = JSON.parse(fileData);
                    if (data.packjson.name === undefined) {
                        return errout({error: "The package.json file is missing the required \u001b[31mname\u001b[39m property.", name: "biddle_getpjson_readfile"});
                    }
                    if (data.packjson.version === undefined) {
                        return errout({
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
            },
            hashCmd   : function biddle_hashCmd(filepath, store, callback) {
                var cmd = "";
                if (data.platform === "darwin") {
                    cmd = "shasum -a 512 " + filepath;
                } else if (data.platform === "win32") {
                    cmd = "certUtil -hashfile " + filepath + " SHA512";
                } else {
                    cmd = "sha512sum " + filepath;
                }
                child(cmd, function biddle_hashCmd_exec(err, stdout, stderr) {
                    if (err !== null) {
                        return errout({error: err, name: "biddle_hashCmd_exec"});
                    }
                    if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                        return errout({error: stderr, name: "biddle_hashCmd_exec"});
                    }
                    stdout      = stdout.replace(/\s+/g, "");
                    stdout      = stdout.replace(filepath, "");
                    stdout      = stdout.replace("SHA512hashoffile:", "");
                    stdout      = stdout.replace("CertUtil:-hashfilecommandcompletedsuccessfully.", "");
                    data[store] = stdout;
                    callback(stdout);
                });
            },
            help      : function biddle_inithelp() {
                return true;
            },
            makedir   : function biddle_makedir(dirToMake, callback) {
                fs
                    .stat(dirToMake, function biddle_makedir_stat(err, stats) {
                        var dirs   = [],
                            ind    = 0,
                            len    = 0,
                            restat = function biggle_makedir_stat_restat() {
                                fs
                                    .stat(dirs.slice(0, ind + 1).join(path.sep), function biddle_makedir_stat_restat_callback(erra, stata) {
                                        ind += 1;
                                        if ((erra !== null && erra.toString().indexOf("no such file or directory") > 0) || (typeof erra === "object" && erra !== null && erra.code === "ENOENT")) {
                                            return fs.mkdir(dirs.slice(0, ind).join(path.sep), function biddle_makedir_stat_restat_callback_mkdir(errb) {
                                                if (errb !== null && errb.toString().indexOf("file already exists") < 0) {
                                                    return errout({error: errb, name: "biddle_makedir_stat_restat_callback_mkdir"});
                                                }
                                                if (ind < len) {
                                                    biggle_makedir_stat_restat();
                                                } else {
                                                    callback();
                                                }
                                            });
                                        }
                                        if (erra !== null && erra.toString().indexOf("file already exists") < 0) {
                                            return errout({error: erra, name: "biddle_makedir_stat_restat_callback"});
                                        }
                                        if (stata.isFile() === true) {
                                            return errout({
                                                error: "Destination directory, '" + dirToMake + "', is a file.",
                                                name : "biddle_makedir_stat_restat_callback"
                                            });
                                        }
                                        if (ind < len) {
                                            biggle_makedir_stat_restat();
                                        } else {
                                            callback();
                                        }
                                    });
                            };
                        if ((err !== null && err.toString().indexOf("no such file or directory") > 0) || (typeof err === "object" && err !== null && err.code === "ENOENT")) {
                            dirs = dirToMake.split(path.sep);
                            if (dirs[0] === "") {
                                ind += 1;
                            }
                            len = dirs.length;
                            return restat();
                        }
                        if (err !== null && err.toString().indexOf("file already exists") < 0) {
                            return errout({error: err, name: "biddle_makedir_stat"});
                        }
                        if (stats.isFile() === true) {
                            return errout({
                                error: "Destination directory, '" + dirToMake + "', is a file.",
                                name : "biddle_makedir_stat"
                            });
                        }
                        callback();
                    });
            },
            readBinary: function biddle_initreadBinary() {
                return true;
            },
            readlist  : function biddle_readlist() {
                var list = "";
                if (data.command === "publish" || (data.command === "list" && input[2] === "published")) {
                    list = "published";
                } else if (data.command === "installed" || data.command === "status" || (data.command === "list" && input[2] === "installed")) {
                    list = "installed";
                } else {
                    return errout({error: "Unqualified operation: readlist() but command is not published or installed.", name: "biddle_readlist"});
                }
                fs
                    .readFile(list + ".json", "utf8", function biddle_readlist_readFile(err, fileData) {
                        var jsondata = JSON.parse(fileData);
                        if (err !== null && err !== undefined) {
                            return errout({error: err, name: "biddle_readlist_readFile"});
                        }
                        data[list]        = jsondata[list];
                        data.status[list] = true;
                    });
            },
            rmrecurse : function biddle_rmrecurse(dirToKill, callback) {
                var cmd = (process.platform === "win32")
                    ? "powershell.exe -nologo -noprofile -command \"rm " + dirToKill + " -r -force\""
                    : "rm -rf " + dirToKill;
                child(cmd, function biddle_rmrecurse_child(err, stdout, stderrout) {
                    if (err !== null) {
                        return errout({error: err, name: "biddle_rmrecurse_child"});
                    }
                    if (stderrout !== null && stderrout !== "") {
                        return errout({error: stderrout, name: "biddle_rmrecurse_child"});
                    }
                    callback();
                    return stdout;
                });
            },
            sanitizef : function biddle_sanitizef(filePath) {
                var paths    = filePath.split(path.sep),
                    fileName = paths.pop();
                paths.push(fileName.replace(/\+|<|>|:|"|\/|\\|\||\?|\*|%/g, ""));
                return paths.join("");
            },
            writeFile : function biddle_initWriteFile() {
                return true;
            }
        },
        zip       = function biddle_zip(callback) {
            var zipfile    = "",
                latestfile = "",
                cmd        = "",
                latestcmd  = "",
                childfunc  = function biddle_zip_childfunc(zipfilename, zipcmd, writejson) {
                    child(zipcmd, function biddle_zip_childfunc_child(err, stdout, stderr) {
                        if (err !== null) {
                            return errout({error: err, name: "biddle_publish_zip_childfunc_child"});
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                            return errout({error: stderr, name: "biddle_publish_zip_childfunc_child"});
                        }
                        if (data.command === "install") {
                            console.log(stdout);
                        }
                        callback(zipfilename, writejson);
                        return stdout;
                    });
                };
            if (data.published[data.packjson.name] !== undefined && data.published[data.packjson.name].versions.indexOf(data.packjson.version) > -1) {
                return errout({
                    error: "Attempted to publish " + data.packjson.name + " over existing version " + data.packjson.version,
                    name : "biddle_zip_zipfunction"
                });
            }
            if (data.command === "publish" || data.command === "zip") {
                if (data.address.target.indexOf(path.sep + "publications") + 1 === data.address.target.length - 13) {
                    data.address.target = data.address.target + data.packjson.name + path.sep;
                }
                if (data.command === "zip") {
                    zipfile = data.address.target + data.fileName + ".zip";
                } else {
                    zipfile = data.address.target + data
                        .packjson
                        .name
                        .toLowerCase() + "_" + data.packjson.version + ".zip";
                }
                if (data.platform === "win32") {
                    //Compress-Archive .\file1.txt, .\file2.txt -DestinationPath .\files.zip
                    cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compress" +
                            "ion.FileSystem'; [IO.Compression.ZipFile]::CreateFromDirectory('" + input[2] + "', '" + zipfile + "'); }\"";
                } else {
                    cmd = "zip -j9yq " + zipfile + " " + input[2] + "/*";
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
                            if (latestVersion === true) {
                                latestfile                                = zipfile.replace(data.packjson.version + ".zip", "latest.zip");
                                latestcmd                                 = cmd.replace(data.packjson.version + ".zip", "latest.zip");
                                data.published[data.packjson.name].latest = data.packjson.version;
                                childfunc(latestfile, latestcmd, false);
                            }
                            childfunc(zipfile, cmd, true);
                        });
                } else {
                    childfunc(zipfile, cmd, false);
                }
            }
            if (data.command === "install" || data.command === "unzip") {
                if (data.platform === "win32") {
                    cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compress" +
                            "ion.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" + zipfile + "', '" + data.address.target + "'); }\"";
                } else {
                    cmd = "unzip -oq " + input[2] + " -d " + data.address.target;
                }
                apps
                    .makedir(data.address.target, function biddle_zip_unzip() {
                        childfunc(input[2], cmd, false);
                    });
            }
        },
        get       = function biddle_get(url, callback) {
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
                            console.log(res.statusCode + " " + http.STATUS_CODES[res.statusCode] + ", for request " + url);
                            if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location !== undefined) {
                                input[2]      = res.headers.location;
                                data.fileName = apps.getFileName();
                                biddle_get(res.headers.location, callback);
                            }
                        } else {
                            apps
                                .makedir(addy, function biddle_get_getcall_end_complete() {
                                    apps.readBinary(url, callback);
                                });
                        }
                    });
                    res.on("error", function biddle_get_getcall_error(error) {
                        return errout({error: error, name: "biddle_get_getcall_error"});
                    });
                };
            if ((/^(https?:\/\/)/).test(url) === false) {
                console.log("Address " + url + " is missing the \u001b[36mhttp(s)\u001b[39m scheme, treating as a local path...");
                apps.makedir(addy, function biddle_get_localFile() {
                    apps.readBinary(url, callback);
                });
            } else if (a > 0 && a < 10) {
                https.get(url, getcall);
            } else {
                http.get(url, getcall);
            }
        },
        install   = function biddle_install() {
            var flag        = {
                    hash: false,
                    zip : false
                },
                compareHash = function biddle_install_compareHash() {
                    apps
                        .hashCmd(data.address.downloads + data.fileName, "hashZip", function biddle_install_compareHash_hashCmd() {
                            if (data.hashFile === data.hashZip) {
                                zip(function biddle_install_callback() {
                                    var status   = {
                                            packjson: false,
                                            remove  : false
                                        },
                                        complete = function biddle_install_compareHash_hashCmd_complete() {
                                            console.log("Application " + data.packjson.name + " is installed to version: " + data.packjson.version);
                                        };
                                    apps.rmrecurse("downloads" + path.sep + data.fileName, function biddle_install_compareHash_hashCmd_remove() {
                                        status.remove = true;
                                        if (status.packjson === true) {
                                            complete();
                                        }
                                    });
                                    // Need to revise zip approach so that child items are manually added to an
                                    // archive This is when an ignore list would be evaluated Need to capture
                                    // application name and version number in addition to hash status.packjson =
                                    // true;
                                });
                            } else {
                                console.log("\u001b[31mHashes don't match\u001b[39m for " + input[2] + ". File is saved in the downloads directory and will not be installed.");
                            }
                        });
                };
            get(input[2], function biddle_install_getzip(fileData) {
                flag.zip = true;
                if (flag.hash === true) {
                    compareHash(fileData);
                }
            });
            get(input[2].replace(".zip", ".hash"), function biddle_install_gethash(fileData) {
                flag.hash = true;
                if (flag.zip === true) {
                    compareHash(fileData);
                }
            });
        },
        publish   = function biddle_publish() {
            var flag  = {
                    getpjson: false,
                    ignore  : false
                },
                zippy = function biddle_publish_zippy() {
                    zip(function biddle_publish_zippy_zip(zipfilename, writejson) {
                        zipfilename = apps.sanitizef(zipfilename);
                        apps.hashCmd(zipfilename, "hashFile", function biddle_publish_zippy_zip_hash() {
                            apps
                                .writeFile(data.hashFile, zipfilename.replace(".zip", ".hash"), function biddle_publish_zippy_zip_hash_writehash() {
                                    return true;
                                });
                            if (writejson === true) {
                                data
                                    .published[data.packjson.name]
                                    .versions
                                    .push(data.packjson.version);
                                apps.writeFile(JSON.stringify(data.published), "published.json", function biddle_publish_zippy_zip_hash_writepub() {
                                    return true;
                                });
                            }
                        });
                    });
                };
            apps.getpjson(function biddle_publish_callback() {
                if (input[3] !== undefined && data.published[data.packjson.name] !== undefined) {
                    data.published[data.packjson.name].directory = data.address.target + data.packjson.name;
                } else if (data.published[data.packjson.name] === undefined) {
                    data.published[data.packjson.name]           = {};
                    data.published[data.packjson.name].versions  = [];
                    data.published[data.packjson.name].latest    = "";
                    data.published[data.packjson.name].directory = data.address.target + data.packjson.name;
                }
                flag.getpjson = true;
                if (flag.ignore === true) {
                    zippy();
                }
            });
            fs.readFile(input[2].replace(/(\/|\\)$/, "") + path.sep + ".biddleignore", "utf8", function biddle_publish_ignore(err, data) {
                var errString = "";
                if (err !== null && err !== undefined) {
                    errString = err.toString();
                    if (errString.indexOf("Error: ENOENT: no such file or directory") === 0) {
                        flag.ignore = true;
                        if (flag.getpjson === true) {
                            zippy();
                        }
                        return;
                    }
                    return errout({error: err, name: "biddle_publish_ignore"});
                }
                data.ignore = data
                    .replace(/\r\n/g, "\n")
                    .replace(/\n+/g, "\n")
                    .split("\n")
                    .sort();
                flag.ignore = true;
                if (flag.getpjson === true) {
                    zippy();
                }
            });
        },
        unpublish = function biddle_unpublish() {
            var app  = data.published[input[2]],
                flag = {
                    dir: false,
                    pub: false
                };
            if (app === undefined) {
                return console.log("Attempted to unpublish \u001b[36m" + input[2] + "\u001b[39m which is \u001b[1m\u001b[31mabsent\u001b[39m\u001b[0m from the list o" +
                        "f published applications. Try using the command \u001b[32mbiddle list published" +
                        "\u001b[39m.");
            }
            apps
                .rmrecurse(app.directory, function biddle_unpublish_callback() {
                    apps
                        .rmrecurse(app.directory, function biddle_unpublish_callback_rmrecurse() {
                            flag.dir = true;
                            if (flag.pub === true) {
                                console.log("App \u001b[36m" + input[2] + "\u001b[39m is unpublished.");
                            }
                        });
                    delete data.published[input[2]];
                    apps.writeFile(JSON.stringify(data.published), "published.json", function biddle_unpublish_callback_writeFile() {
                        flag.pub = true;
                        if (flag.dir === true) {
                            console.log("App \u001b[36m" + input[2] + "\u001b[39m is unpublished.");
                        }
                    });
                });
        },
        list      = function biddle_list() {
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
            if (input[2] !== "installed" && input[2] !== "published" && input[2] !== undefined) {
                input[2] = "both";
            }
            if (input[2] === "installed" || input[2] === "both" || input[2] === undefined) {
                dolist("installed");
            }
            if (input[2] === "published" || input[2] === "both" || input[2] === undefined) {
                dolist("published");
            }
        },
        test      = function biddle_test() {
            var startTime = Date.now(),
                order     = [
                    "install", "lint",
                    //"get",
                    "hash"
                    // "help", "install", not written yet "list", "markdown", "publish", "status",
                    // not written yet "uninstall", not written yet "unpublish", "unzip", "zip"
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
                        a += 1;
                        name = name + " ";
                    } while (a < longname);
                    return name;
                },
                modules   = {
                    jslint    : {
                        dir    : "JSLint",
                        edition: function biddle_test_lint_modules_jslint(obj) {
                            console.log("* " + namepad(obj.name) + " - " + obj.app().edition);
                        },
                        file   : "jslint.js",
                        name   : "JSLint",
                        repo   : "https://github.com/douglascrockford/JSLint.git"
                    },
                    prettydiff: {
                        dir    : "prettydiff",
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
                humantime = function biddle_test_humantime(finished) {
                    var minuteString = "",
                        hourString   = "",
                        secondString = "",
                        finalTime    = "",
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
                        plural       = function core__proctime_plural(x, y) {
                            var a = "";
                            if (x !== 1) {
                                a = x + y + "s ";
                            } else {
                                a = x + y + " ";
                            }
                            return a;
                        },
                        minute       = function core__proctime_minute() {
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
                        finalTime = hourString + minuteString + secondString;
                        console.log(finalMem + " of memory consumed");
                        console.log(finalTime + "total time");
                        console.log("");
                    } else {
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
                    }
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
                    options.source  = sampleSource;
                    options.diff    = sampleDiff;
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
                        return errout({
                            error: colors.del.lineStart + "bad test" + colors.del.lineEnd,
                            name : sampleName
                        });
                    }
                    // report indexes from diffcli feature of diffview.js 0 - source line number 1 -
                    // source code line 2 - diff line number 3 - diff code line 4 - change 5 - index
                    // of options.context (not parallel) 6 - total count of differences
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
                    if (sampleName !== "phases.simulations") {
                        console.log("");
                        console.log(diffs + colors.filepath.start + " differences counted." + colors.filepath.end);
                        errout({
                            error: "Pretty Diff " + colors.del.lineStart + "failed" + colors.del.lineEnd + " in function: " + colors.filepath.start + sampleName + colors.filepath.end,
                            name : sampleName
                        });
                    }
                },
                fail      = function biddle_test_fail(errtext) {
                    console.log("");
                    console.error(errtext);
                    humantime(true);
                    process.exit(1);
                },
                next      = function biddle_test_nextInit() {
                    return;
                },
                phases    = {
                    //get: function biddle_test_get() {},
                    hash   : function biddle_test_hash() {
                        child("node biddle hash LICENSE", function biddle_test_hash_child(er, stdout, stder) {
                            var hash = "be09a71a2cda28b74e9dd206f46c1621aebe29182723f191d8109db4705ced014de469043c397fee" +
                                    "4d8f3483e396007ca739717af4bf43fed4c2e3dd14f3dc0c";
                            if (er !== null) {
                                errout({error: er, name: "biddle_test_hash_child"});
                            }
                            if (stder !== null && stder !== "") {
                                errout({error: stder, name: "biddle_test_hash_child"});
                            }
                            //why does stdout have an empty line at end?
                            stdout = stdout.replace(/(\s+)$/, "");
                            if (stdout !== hash) {
                                diffFiles("biddle_test_hash_child", stdout, hash);
                            }
                            console.log(humantime(false) + " Hash test passed.");
                            next();
                        });
                    },
                    install: function biddle_test_install() {
                        var dateobj  = new Date(),
                            day      = (dateobj.getDate() > 9)
                                ? "" + dateobj.getDate()
                                : "0" + dateobj.getDate(),
                            month    = (dateobj.getMonth() > 9)
                                ? "" + (dateobj.getMonth() + 1)
                                : "0" + (dateobj.getMonth() + 1),
                            date     = Number("" + dateobj.getFullYear() + month + day),
                            ind      = 0,
                            flag     = {
                                apps  : false,
                                jslint: false,
                                today : false
                            },
                            modout   = function biddle_test_install_modout() {
                                var x   = 0,
                                    len = keys.length;
                                console.log("Installed submodule versions");
                                console.log("----------------------------");
                                for (x = 0; x < len; x += 1) {
                                    modules[keys[x]].edition(modules[keys[x]]);
                                }
                                next();
                            },
                            today    = require("./today.js"),
                            editions = function biddle_test_install_editionsInit() {
                                return;
                            },
                            handler  = function biddle_test_install_handler() {
                                var mod = keys[ind];
                                modules[keys[ind]].name = "\u001b[32m" + modules[keys[ind]].name + "\u001b[39m";
                                if (modules[keys[ind]].name.length > longname) {
                                    longname = modules[keys[ind]].name.length;
                                }
                                fs.stat(modules[mod].dir, function biddle_test_install_handler_stat(erstat, stats) {
                                    var clone = function biddle_test_install_handler_stat_clone() {
                                        console.log("Cloning " + modules[mod].name);
                                        child("git submodule add " + modules[mod].repo, function biddle_test_install_handler_stat_clone_submodule(era, stdouta, stdoutera) {
                                            if (era !== null && era.toString().indexOf("already exists in the index") < 0) {
                                                errout({error: era, name: "biddle_test_install_handler_stat_clone_submodule"});
                                            }
                                            if (stdoutera !== null && stdoutera !== "" && stdoutera.indexOf("Cloning into '") < 0 && stdoutera.indexOf("already exists in the index") < 0) {
                                                errout({error: stdoutera, name: "biddle_test_install_handler_stat_clone_submodule"});
                                            }
                                            ind += 1;
                                            editions(mod, true, ind);
                                            return stdouta;
                                        });
                                    };
                                    if (erstat !== null && erstat !== undefined) {
                                        if (erstat.toString() === "Error: ENOENT: no such file or directory, stat '" + modules[mod].dir + "'") {
                                            return clone();
                                        }
                                        return errout({error: erstat, name: "biddle_test_install_handler_stat"});
                                    }
                                    if (stats.isDirectory() === true) {
                                        return fs.readdir(modules[mod].dir, function biddle_test_install_handler_stat_readdir(direrr, files) {
                                            if (typeof direrr === "string") {
                                                return errout({error: direrr, name: "biddle_test_install_handler_stat_readdir"});
                                            }
                                            ind += 1;
                                            if (files.length < 1) {
                                                child("rm -rf " + modules[mod].dir, function biddle_test_install_handler_stat_readdir_clone(errp, stdoutp, stdouterp) {
                                                    if (errp !== null) {
                                                        errout({error: errp, name: "biddle_test_install_handler_stat_readdir_clone"});
                                                    }
                                                    if (stdouterp !== null && stdouterp !== "") {
                                                        errout({error: stdouterp, name: "biddle_test_install_handler_stat_readdir_clone"});
                                                    }
                                                    clone();
                                                    return stdoutp;
                                                });
                                            } else {
                                                editions(mod, false, ind);
                                            }
                                        });
                                    }
                                    clone();
                                });
                            };
                        editions = function biddle_test_install_editions(appName, cloned, index) {
                            var submod = function biddle_test_install_editions_submod(output) {
                                var appFile        = __dirname + path.sep + modules[appName].dir + path.sep + modules[appName].file,
                                    jslintcomplete = function biddle_test_install_editions_submod_jslintcomplete() {
                                        modules.jslint.app = require(appFile);
                                        flag.jslint        = true;
                                        if (ind === keys.length) {
                                            if (flag.today === true) {
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
                                    fs
                                        .readFile(appFile, "utf8", function biddle_test_install_editions_submod_lintread(erread, data) {
                                            if (erread !== null && erread !== undefined) {
                                                errout({error: erread, name: "biddle_test_install_editions_lintread"});
                                            }
                                            if (data.slice(data.length - 30).indexOf("\nmodule.exports = jslint;") < 0) {
                                                data = data + "\nmodule.exports = jslint;";
                                                fs.writeFile(appFile, data, "utf8", function biddle_test_install_editions_submod_lintread_lintwrite(erwrite) {
                                                    if (erwrite !== null && erwrite !== undefined) {
                                                        errout({error: erwrite, name: "biddle_test_install_editions_lintread_lintwrite"});
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
                                            modout();
                                        } else {
                                            if (output === true) {
                                                console.log("All submodules configured.");
                                            }
                                            flag.apps = true;
                                        }
                                    }
                                }
                            };
                            if (index === keys.length) {
                                if (today !== date) {
                                    fs
                                        .writeFile("today.js", "/*global module*/(function () {\"use strict\";var today=" + date + ";module.exports=today;}());", function biddle_test_install_editions_writeToday(werr) {
                                            if (werr !== null && werr !== undefined) {
                                                errout({error: werr, name: "biddle_test_install_editions_writeToday"});
                                            }
                                            if (cloned === true) {
                                                console.log("Submodules downloaded.");
                                            } else {
                                                console.log("Submodules updated!");
                                            }
                                            if (flag.apps === true) {
                                                modout();
                                            } else {
                                                console.log("Checked for new versions of submodules.");
                                                flag.today = true;
                                            }
                                        });
                                    if (cloned === true) {
                                        child("git submodule init", function biddle_test_install_editions_init(erc, stdoutc, stdouterc) {
                                            if (erc !== null) {
                                                errout({error: erc, name: "biddle_test_install_editions_init"});
                                            }
                                            if (stdouterc !== null && stdouterc !== "" && stdouterc.indexOf("Cloning into '") < 0 && stdouterc.indexOf("From ") < 0) {
                                                errout({error: stdouterc, name: "biddle_test_install_editions_init"});
                                            }
                                            child("git submodule update", function biddle_test_install_editions_init_update(erd, stdoutd, stdouterd) {
                                                if (erd !== null) {
                                                    errout({error: erd, name: "biddle_test_install_editions_init_update"});
                                                }
                                                if (stdouterd !== null && stdouterd !== "" && stdouterd.indexOf("Cloning into '") < 0 && stdouterd.indexOf("From ") !== 0) {
                                                    errout({error: stdouterd, name: "biddle_test_install_editions_init_update"});
                                                }
                                                if (flag.today === false) {
                                                    console.log("Submodules downloaded.");
                                                }
                                                return stdoutd;
                                            });
                                            return stdoutc;
                                        });
                                    } else {
                                        child("git submodule foreach git pull origin master", function biddle_test_install_editions_pull(errpull, stdoutpull, stdouterpull) {
                                            if (errpull !== null) {
                                                if (errpull.toString().indexOf("fatal: no submodule mapping found in .gitmodules for path ") > 0) {
                                                    console.log("No access to GitHub. Proceeding assuming submodules were previously installed.");
                                                    flag.apps = true;
                                                    return submod(false);
                                                }
                                                errout({error: errpull, name: "biddle_test_install_editions_pull"});
                                            }
                                            if (stdouterpull !== null && stdouterpull !== "" && stdouterpull.indexOf("Cloning into '") < 0 && stdouterpull.indexOf("From ") < 0 && stdouterpull.indexOf("fatal: no submodule mapping found in .gitmodules for path ") < 0) {
                                                errout({error: stdouterpull, name: "biddle_test_install_editions_pull"});
                                            }
                                            if (flag.today === false) {
                                                console.log("Submodules updated!");
                                            }
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
                        handler(0);
                    },
                    lint   : function biddle_test_lint() {
                        var ignoreDirectory = [
                                ".git", "applications", "downloads", "publications"
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
                                            fail("\u001b[31mLint fail\u001b[39m :(");
                                        } else {
                                            console.log(humantime(false) + "\u001b[32mLint is good for file " + (ind + 1) + ":\u001b[39m " + val[0]);
                                            if (ind === arr.length - 1) {
                                                console.log("");
                                                console.log("\u001b[32mLint operation complete!\u001b[39m");
                                                console.log("");
                                                return next();
                                            }
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
                        keys.forEach(function biddle_test_lint_updateIgnores(mod) {
                            ignoreDirectory.push(modules[mod].dir);
                        });
                        (function biddle_test_lint_getFiles() {
                            var fc       = 0,
                                ft       = 0,
                                total    = 0,
                                count    = 0,
                                flag     = {
                                    files: false,
                                    items: false
                                },
                                idLen    = ignoreDirectory.length,
                                readFile = function biddle_test_lint_getFiles_readFile(filePath) {
                                    fs
                                        .readFile(filePath, "utf8", function biddle_test_lint_getFiles_readFile_callback(err, data) {
                                            if (err !== null && err !== undefined) {
                                                errout({error: err, name: "biddle_test_lint_getFiles_readFile_callback"});
                                            }
                                            fc += 1;
                                            if (ft === fc) {
                                                flag.files = true;
                                            }
                                            filePath = filePath.replace(process.cwd(), "");
                                            if (filePath.charAt(0) === path.sep) {
                                                filePath = filePath.slice(1);
                                            }
                                            files.push([filePath, data]);
                                            if (flag.files === true && flag.items === true) {
                                                lintrun();
                                            }
                                        });
                                },
                                readDir  = function biddle_test_lint_getFiles_readDir(path) {
                                    fs
                                        .readdir(path, function biddle_test_lint_getFiles_readDir_callback(erra, list) {
                                            var fileEval = function biddle_test_lint_getFiles_readDir_callback_fileEval(val) {
                                                var filename = path + "/" + val;
                                                fs.stat(filename, function biddle_test_lint_getFiles_readDir_callback_fileEval_stat(errb, stat) {
                                                    var a         = 0,
                                                        ignoreDir = false;
                                                    if (errb !== null) {
                                                        return errout({error: errb, name: "biddle_test_lint_getFiles_readDir_callback_fileEval_stat"});
                                                    }
                                                    count += 1;
                                                    if (count === total) {
                                                        flag.items = true;
                                                    }
                                                    if (stat.isFile() === true && (/(\.js)$/).test(val) === true) {
                                                        ft += 1;
                                                        readFile(filename);
                                                    }
                                                    if (stat.isDirectory() === true) {
                                                        do {
                                                            if (val === ignoreDirectory[a]) {
                                                                ignoreDir = true;
                                                                break;
                                                            }
                                                            a += 1;
                                                        } while (a < idLen);
                                                        if (ignoreDir === true) {
                                                            if (flag.files === true && flag.items === true) {
                                                                lintrun();
                                                            }
                                                        } else {
                                                            biddle_test_lint_getFiles_readDir(filename);
                                                        }
                                                    }
                                                });
                                            };
                                            if (erra !== null) {
                                                return errout({
                                                    error: "Error reading path: " + path + "\n" + erra,
                                                    name : "biddle_test_lint_getFiles_readDir_callback"
                                                });
                                            }
                                            total += list.length;
                                            list.forEach(fileEval);
                                        });
                                };
                            readDir(__dirname.replace(/((\/|\\)test)$/, ""));
                        }());
                    }
                };

            next = function biddle_test_next() {
                var complete = function biddle_test_next_complete() {
                    console.log("All tasks complete... Exiting clean!");
                    humantime(true);
                    process.exit(0);
                };
                console.log("");
                if (order.length < 1) {
                    return complete();
                }
                phases[order[0]]();
                order.splice(0, 1);
            };
            next();
        };
    data.address     = (function biddle_address() {
        var addy = {
            downloads: data.abspath + "downloads" + path.sep,
            target   : ""
        };
        if (typeof input[3] === "string") {
            addy.target = input[3];
        } else if (data.command === "publish") {
            addy.target = data.abspath + "publications" + path.sep;
        } else if (data.command === "install") {
            addy.target = data.abspath + "applications" + path.sep;
        }
        return addy;
    }());
    apps.getFileName = function biddle_getFileName() {
        var paths  = [],
            output = "";
        if (input[2] === undefined) {
            return "download.xxx";
        }
        paths = input[2].split(path.sep);
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
    apps.writeFile   = function biddle_writeFile(fileData, fileName, callback) {
        var callbacker = function biddle_writeFile_callbacker(size) {
            if (size > 0 && fileName !== "published.json" && fileName !== "installed.json") {
                console.log("File " + fileName + " written at " + apps.commas(size) + " bytes.");
            }
            callback(fileData);
        };
        fs.writeFile(fileName, fileData, function biddle_writeFile_callback(err) {
            if (err !== null) {
                return errout({error: err, name: "biddle_writeFile_callback"});
            }
            if (data.command === "get" || data.command === "publish") {
                if (data.command === "publish") {
                    fileName = fileName.replace(".hash", ".zip");
                }
                fs
                    .stat(fileName, function biddle_writeFile_callback_getstat(errstat, stat) {
                        if (errstat !== null) {
                            return errout({error: errstat, name: "biddle_writeFile_callback_getstat"});
                        }
                        callbacker(stat.size);
                    });
            } else {
                callbacker(0);
            }
        });
    };
    apps.readBinary  = function biddle_readBinary(filePath, callback) {
        var size        = 0,
            fdescript   = 0,
            writeBinary = function biddle_readBinary_writeBinary() {
                fs
                    .open(data.address.downloads + path.sep + data.fileName, "w", function biddle_readBinary_writeBinary_writeopen(errx, fd) {
                        var buffer = new Buffer(size);
                        if (errx !== null) {
                            return errout({error: errx, name: "biddle_readBinary_writeBinary_writeopen"});
                        }
                        fs
                            .read(fdescript, buffer, 0, size, 0, function biddle_readBinary_writeBinary_writeopen_read(erry, ready, buffy) {
                                if (erry !== null) {
                                    return errout({error: erry, name: "biddle_readBinary_writeBinary_writeopen_read"});
                                }
                                if (ready > 0) {
                                    fs
                                        .write(fd, buffy, 0, size, function biddle_readBinary_writeBinary_writeopen_read_write(errz, written, buffz) {
                                            if (errz !== null) {
                                                return errout({error: errz, name: "biddle_readBinary_writeBinary_writeopen_read_write"});
                                            }
                                            if (written < 1) {
                                                return errout({
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
        fs.stat(filePath, function biddle_readBinary_stat(errs, stats) {
            if (errs !== null) {
                return errout({error: errs, name: "biddle_readBinary_stat"});
            }
            size = stats.size;
            fs.open(filePath, "r", function biddle_readyBinary_stat_open(erro, fd) {
                var length = (stats.size < 100)
                        ? stats.size
                        : 100,
                    buffer = new Buffer(length);
                fdescript = fd;
                if (erro !== null) {
                    return errout({error: erro, name: "biddle_readBinary_stat_open"});
                }
                fs
                    .read(fd, buffer, 0, length, 1, function biddle_readyBinary_stat_open_read(errr, read, buff) {
                        var bstring = "";
                        if (errr !== null) {
                            return errout({error: errr, name: "biddle_readBinary_stat_open_read"});
                        }
                        bstring = buff.toString("utf8", 0, buff.length);
                        bstring = bstring.slice(2, bstring.length - 2);
                        if ((/[\u0002-\u0008]|[\u000e-\u001f]/).test(bstring) === true) {
                            writeBinary();
                        } else {
                            fs
                                .readFile(filePath, "utf8", function biddle_readBinary_stat_open_read_readFile(errf, fileData) {
                                    if (errf !== null && errf !== undefined) {
                                        return errout({error: errf, name: "biddle_readBinary_stat_open_read_readFile"});
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
    apps.help        = function biddle_help() {
        var file = "readme.md",
            size = input[2];
        if (data.command === "markdown") {
            file = input[2];
            size = input[3];
        }
        fs
            .readFile(file, "utf8", function biddle_help_readme(err, readme) {
                var lines  = [],
                    listly = [],
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
                    return errout({error: err, name: "biddle_help_readme"});
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
                console.log("");
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
                    console.log(lines[b]);
                }
                process.exit(0);
            });
    };
    (function biddle_init() {
        var status    = {
                installed: false,
                published: false
            },
            comlist   = {
                get      : true,
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
                if (data.command === "help" || data.command === "" || data.command === undefined || data.command === "?" || data.command === "markdown") {
                    apps.help();
                } else if (isNaN(data.command) === false) {
                    input[1]     = "help";
                    input[2]     = data.command;
                    data.command = "help";
                    apps.help();
                } else if (comlist[data.command] === undefined) {
                    errout({
                        error: "Unrecognized command: \u001b[31m" + data.command + "\u001b[39m.  Currently these commands are recognized:\r\n\r\n" + Object
                            .keys(comlist)
                            .join("\r\n") + "\r\n",
                        name : "biddle_init_start"
                    });
                } else {
                    if (input[2] === undefined && data.command !== "status" && data.command !== "list" && data.command !== "test") {
                        if (data.command === "hash" || data.command === "markdown" || data.command === "unzip" || data.command === "zip") {
                            valuetype = "path to a local file";
                        } else if (data.command === "get" || data.command === "install" || data.command === "publish") {
                            valuetype = "URL address for a remote resource or path to a local file";
                        } else if (data.command === "uninstall" || data.command === "unpublish") {
                            valuetype = "known application name";
                        }
                        return errout({
                            error: "Command \u001b[32m" + data.command + "\u001b[39m requires a " + valuetype + ".",
                            name : "biddle_init_start"
                        });
                    }
                    if (data.command === "get") {
                        get(input[2], function biddle_init_start_getback(filedata) {
                            apps
                                .writeFile(filedata, data.address.target + data.fileName, function biddle_init_start_getback_callback() {
                                    return filedata;
                                });
                        });
                    } else if (data.command === "install") {
                        install();
                    } else if (data.command === "list") {
                        list();
                    } else if (data.command === "publish") {
                        publish();
                    } else if (data.command === "unpublish") {
                        unpublish();
                    } else if (data.command === "hash") {
                        apps
                            .hashCmd(input[2], "hashFile", function biddle_init_start_hash() {
                                console.log(data.hashFile);
                            });
                    } else if (data.command === "zip") {
                        zip(function biddle_init_start_zip(zipfile) {
                            return console.log("Zip file written: " + zipfile);
                        });
                    } else if (data.command === "unzip") {
                        zip(function biddle_init_start_unzip(zipfile) {
                            return console.log("File " + zipfile + " unzipped to: " + data.address.target);
                        });
                    } else if (data.command === "test") {
                        test();
                    }
                }
            };
        data.fileName = apps.getFileName();
        fs.readFile(data.abspath + "installed.json", "utf8", function biddle_init_installed(err, fileData) {
            var parsed = {};
            if (err !== null && err !== undefined) {
                return errout({error: err, name: "biddle_init_installed"});
            }
            status.installed = true;
            parsed           = JSON.parse(fileData);
            data.installed   = parsed;
            if (status.published === true) {
                start();
            }
        });
        fs.readFile(data.abspath + "published.json", "utf8", function biddle_init_published(err, fileData) {
            var parsed = {};
            if (err !== null && err !== undefined) {
                return errout({error: err, name: "biddle_init_published"});
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
