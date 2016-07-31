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
            var a = [],
                b = 0,
                c = process.argv.length,
                paths = process.argv[0].split(path.sep);
            if (paths[paths.length - 1] === "node") {
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
                var absarr  = input[0].split(path.sep);
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
            installed: {},
            platform : process
                .platform
                .replace(/\s+/g, "")
                .toLowerCase(),
            packjson : {},
            published: {}
        },
        apps      = {
            commas   : function biddle_commas(number) {
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
            getFileName: function biddle_getFileName() {
                var paths = [];
                if (input[2] === undefined) {
                    return "download.xxx";
                }
                paths = input[2].split(path.sep);
                if (paths[paths.length - 1].length > 0) {
                    return paths[paths.length - 1];
                }
                do {
                    paths.pop();
                } while (paths.length > 0 && paths[paths.length - 1] === "");
                if (paths.length < 1) {
                    return "download.xxx";
                }
                return paths[paths.length - 1];
            },
            getpjson : function biddle_getpjson(callback) {
                var file = input[2].replace(/(\/|\\)$/, "") + path.sep + "package.json";
                fs.readFile(file, "utf8", function biddle_getpjson_readfile(err, fileData) {
                    if (err !== null && err !== undefined) {
                        return errout({
                            name: "biddle_getpjson_readFile",
                            error: err
                        });
                    }
                    data.packjson = JSON.parse(fileData);
                    if (data.packjson.name === undefined) {
                        return errout({
                            name: "biddle_getpjson_readfile",
                            error: "The package.json file is missing the required \x1B[31mname\x1B[39m property."
                        });
                    }
                    if (data.packjson.version === undefined) {
                        return errout({
                            name: "biddle_getpjson_readfile",
                            error: "The package.json file is missing the required \x1B[31mversion\x1B[39m property."
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
            hashCmd  : function biddle_hashCmd(filepath, store, callback) {
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
                        return errout({
                            name: "biddle_hashCmd_exec",
                            error: err
                        });
                    }
                    if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                        return errout({
                            name: "biddle_hashCmd_exec",
                            error: stderr
                        });
                    }
                    stdout    = stdout.replace(/\s+/g, "");
                    stdout    = stdout.replace(filepath, "");
                    stdout    = stdout.replace("SHA512hashoffile:", "");
                    stdout    = stdout.replace("CertUtil:-hashfilecommandcompletedsuccessfully.", "");
                    data[store] = stdout;
                    callback(stdout);
                });
            },
            help     : function biddle_inithelp() {
                return true;
            },
            makedir  : function biddle_makedir(dirToMake, callback) {
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
                                                    return errout({
                                                        name: "biddle_makedir_stat_restat_callback_mkdir",
                                                        error: errb
                                                    });
                                                }
                                                if (ind < len) {
                                                    biggle_makedir_stat_restat();
                                                } else {
                                                    callback();
                                                }
                                            });
                                        }
                                        if (erra !== null && erra.toString().indexOf("file already exists") < 0) {
                                            return errout({
                                                name: "biddle_makedir_stat_restat_callback",
                                                error: erra
                                            });
                                        }
                                        if (stata.isFile() === true) {
                                            return errout({
                                                name: "biddle_makedir_stat_restat_callback",
                                                error: "Destination directory, '" + dirToMake + "', is a file."
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
                            len  = dirs.length;
                            return restat();
                        }
                        if (err !== null && err.toString().indexOf("file already exists") < 0) {
                            return errout({
                                name: "biddle_makedir_stat",
                                error: err
                            });
                        }
                        if (stats.isFile() === true) {
                            return errout({
                                name: "biddle_makedir_stat",
                                error: "Destination directory, '" + dirToMake + "', is a file."
                            });
                        }
                        callback();
                    });
            },
            readBinary: function biddle_initreadBinary() {
                return true;
            },
            readlist : function biddle_readlist() {
                var list = "";
                if (data.command === "publish" || (data.command === "list" && input[2] === "published")) {
                    list = "published";
                } else if (data.command === "installed" || data.command === "status" || (data.command === "list" && input[2] === "installed")) {
                    list = "installed";
                } else {
                    return errout({
                        name: "biddle_readlist",
                        error: "Unqualified operation: readlist() but command is not published or installed."
                    });
                }
                fs
                    .readFile(list + ".json", "utf8", function biddle_readlist_readFile(err, fileData) {
                        var jsondata = JSON.parse(fileData);
                        if (err !== null && err !== undefined) {
                            return errout({
                                name: "biddle_readlist_readFile",
                                error: err
                            });
                        }
                        data[list]        = jsondata[list];
                        data.status[list] = true;
                    });
            },
            rmrecurse: function biddle_rmrecurse(dirToKill, callback) {
                var cmd = (process.platform === "win32")
                    ? "powershell.exe -nologo -noprofile -command \"rm " + dirToKill + " -r -force\""
                    : "rm -rf " + dirToKill;
                child(cmd, function biddle_rmrecurse_child(err, stdout, stderrout) {
                    if (err !== null) {
                        return errout({
                            name: "biddle_rmrecurse_child",
                            error: err
                        });
                    }
                    if (stderrout !== null && stderrout !== "") {
                        return errout({
                            name: "biddle_rmrecurse_child",
                            error: stderrout
                        });
                    }
                    callback();
                    return stdout;
                });
            },
            writeFile: function biddle_initWriteFile() {
                return true;
            }
        },
        zip       = function biddle_zip(callback) {
            var zipfile = "",
                latestfile  = "",
                cmd     = "",
                latestcmd = "",
                publength = "publications".length,
                childfunc = function biddle_zip_childfunc(zipfilename, zipcmd, writejson) {
                    child(zipcmd, function biddle_zip_childfunc_child(err, stdout, stderr) {
                        if (err !== null) {
                            return errout({
                                name: "biddle_publish_zip_childfunc_child",
                                error: err
                            });
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                            return errout({
                                name: "biddle_publish_zip_childfunc_child",
                                error: stderr
                            });
                        }
                        callback(zipfilename, writejson);
                        return stdout;
                    });
                };
            if (data.published[data.packjson.name] !== undefined && data.published[data.packjson.name].versions.indexOf(data.packjson.version) > -1) {
                return errout({
                    name: "biddle_zip_zipfunction",
                    error: "Attempted to publish " + data.packjson.name + " over existing version " + data.packjson.version
                });
            }
            if (data.command === "publish" || data.command === "zip") {
                if (data.address.target.indexOf(path.sep + "publications") + 1 === data.address.target.length - (publength + 1)) {
                    data.address.target = data.address.target + data.packjson.name + path.sep;
                }
                zipfile = data.address.target + data.packjson.name + "_" + data.packjson.version + ".zip";
                if (data.platform === "win32") {
                    cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::CreateFromDirectory('" + input[2] + "', '" + zipfile + "'); }\"";
                } else {
                    cmd = "zip -r9yq " + zipfile + " " + input[2];
                }
            }
            if (data.command === "publish") {
                apps.makedir(data.address.target, function biddle_zip_publish() {
                    if (data.packjson.version.indexOf("beta") < 0 && data.packjson.version.indexOf("alpha") < 0) {
                        latestfile = zipfile.replace(data.packjson.version + ".zip", "latest.zip");
                        latestcmd = cmd.replace(data.packjson.version + ".zip", "latest.zip");
                        data.published[data.packjson.name].latest = data.packjson.version;
                        childfunc(latestfile, latestcmd, false);
                    }
                    childfunc(zipfile, cmd, true);
                });
            }
            if (data.command === "install") {
                if (data.platform === "win32") {
                    cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" + zipfile + "', '" + input[2] + "'); }\"";
                } else {
                    cmd = "unzip -oq " + zipfile + " -d " + input[2];
                }
                apps.makedir(data.address.target, installit);
            }
            if (data.command === "zip" || data.command === "unzip") {
                childfunc(zipfile, cmd, true);
            }
        },
        get       = function biddle_get(url, callback) {
            var a        = (typeof url === "string")
                    ? url.indexOf("s://")
                    : 0,
                file     = "",
                hashy = (data.command === "install" && data.fileName.indexOf(".hash") < 0),
                addy = (hashy === true)
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
                                input[2] = res.headers.location;
                                data.fileName = apps.getFileName();
                                biddle_get(res.headers.location, callback);
                            }
                        } else {
                            apps.makedir(addy, function biddle_get_getcall_end_complete() {
                                apps.readBinary(url, callback);
                            });
                        }
                    });
                    res.on("error", function biddle_get_getcall_error(error) {
                        return errout({
                            name: "biddle_get_getcall_error",
                            error: error
                        });
                    });
                };
            if ((/^(https?:\/\/)/).test(url) === false) {
                console.log("Address " + url + " is missing the \x1B[36mhttp(s)\x1B[39m scheme, treating as a local path...");
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
            var flag = {
                    zip: false,
                    hash: false
                },
                compareHash = function biddle_install_compareHash() {
                    apps.hashCmd(data.address.downloads + data.fileName, "hashZip", function biddle_install_compareHash_hashCmd() {
                        if (data.hashFile === data.hashZip) {
                            zip();
                        } else {
                            console.log("\x1B[31mHashes don't match\x1B[39m for " + input[2] + ". File is saved in the downloads directory and will not be installed.");
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
            if (data.published[data.packjson.name] === undefined) {
                data.published[data.packjson.name] = {};
                data.published[data.packjson.name].versions = [];
            }
            if (data.published[data.packjson.name].directory === undefined) {
                data.published[data.packjson.name].directory = data.address.target;
            }
            apps.getpjson(function biddle_publish_callback() {
                zip(function biddle_publish_callback_zip(zipfilename, writejson) {
                    apps
                        .hashCmd(zipfilename, "hashFile", function biddle_publish_zip_childfunc_child_hash() {
                            apps.writeFile(data.hashFile, zipfilename.replace(".zip", ".hash"), function biddle_publish_zip_childfunc_child_hash_writehash() {
                                console.log("Hash file " + zipfilename.replace(".zip", ".hash") + " written.");
                            });
                            if (writejson === true) {
                                data.published[data.packjson.name].versions.push(data.packjson.version);
                                apps.writeFile(JSON.stringify(data.published), "published.json", function biddle_publish_zip_childfunc_child_hash_writepub() {
                                    return true;
                                });
                            }
                        });
                });
            });
        },
        unpublish = function biddle_unpublish() {
            var app = data.published[input[2]],
                flag = {
                    dir: false,
                    pub: false
                };
            if (app === undefined) {
                return console.log("Attempted to unpublish \x1B[36m" + input[2] + "\x1B[39m which is \x1B[1m\x1B[31mabsent\x1B[39m\x1B[0m from the list of published applications. Try using the command \x1B[32mbiddle list published\x1B[39m.");
            }
            apps.rmrecurse(app.directory, function biddle_unpublish_callback() {
                apps.rmrecurse(app.directory, function biddle_unpublish_callback_rmrecurse() {
                    flag.dir = true;
                    if (flag.pub === true) {
                        console.log("App \x1B[36m" + input[2] + "\x1B[39m is unpublished.");
                    }
                });
                delete data.published[input[2]];
                apps.writeFile(JSON.stringify(data.published), "published.json", function biddle_unpublish_callback_writeFile() {
                    flag.pub = true;
                    if (flag.dir === true) {
                        console.log("App \x1B[36m" + input[2] + "\x1B[39m is unpublished.");
                    }
                });
            });
        };
    data.address   = (function biddle_address() {
        var addy = {
            downloads: data.abspath + "downloads" + path.sep,
            target: ""
        };
        if (typeof input[3] === "string") {
            addy.target = input[3];
        } else if (data.command === "publish") {
            addy.target = data.abspath + "publications" + path.sep;
        } else {
            addy.target = addy.downloads;
        }
        return addy;
    }());
    apps.writeFile = function biddle_writeFile(fileData, fileName, callback) {
        var callbacker = function biddle_writeFile_callbacker(size) {
            if (size > 0 && fileName !== "published.json" && fileName !== "installed.json") {
                console.log("File " + fileName + " written at " + apps.commas(size) + " bytes.");
            }
            callback(fileData);
        };
        fs
            .writeFile(fileName, fileData, function biddle_writeFile_callback(err) {
                if (err !== null) {
                    return errout({
                        name: "biddle_writeFile_callback",
                        error: err
                    });
                }
                if (data.command === "get" || data.command === "publish") {
                    if (data.command === "publish") {
                        fileName = fileName.replace(".hash", ".zip");
                    }
                    fs
                        .stat(fileName, function biddle_writeFile_callback_getstat(errstat, stat) {
                            if (errstat !== null) {
                                return errout({
                                    name: "biddle_writeFile_callback_getstat",
                                    error: errstat
                                });
                            }
                            callbacker(stat.size);
                        });
                } else {
                    callbacker(0);
                }
            });
    };
    apps.readBinary = function biddle_readBinary(filePath, callback) {
        var size = 0,
            fdescript = 0,
            writeBinary = function biddle_readBinary_writeBinary() {
                fs.open(data.address.downloads + path.sep + data.fileName, "w", function biddle_readBinary_writeBinary_writeopen(errx, fd) {
                    var buffer = new Buffer(size);
                    if (errx !== null) {
                        return errout({
                            name: "biddle_readBinary_writeBinary_writeopen",
                            error: errx
                        });
                    }
                    fs.read(fdescript, buffer, 0, size, 0, function biddle_readBinary_writeBinary_writeopen_read(erry, ready, buffy) {
                        if (erry !== null) {
                            return errout({
                                name: "biddle_readBinary_writeBinary_writeopen_read",
                                error: erry
                            });
                        }
                        if (ready > 0) {
                            fs.write(fd, buffy, 0, size, function biddle_readBinary_writeBinary_writeopen_read_write(errz, written, buffz) {
                                if (errz !== null) {
                                    return errout({
                                        name: "biddle_readBinary_writeBinary_writeopen_read_write",
                                        error: errz
                                    });
                                }
                                if (written < 1) {
                                    return errout({
                                        name: "biddle_readBinary_writeBinary_writeopen_read_write",
                                        error: "Reading binary file " + filePath + " but 0 bytes were read."
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
                return errout({
                    name: "biddle_readBinary_stat",
                    error: errs
                });
            }
            size = stats.size;
            fs.open(filePath, "r", function biddle_readyBinary_stat_open(erro, fd) {
                var length = (stats.size < 100)
                        ? stats.size
                        : 100,
                    buffer = new Buffer(length);
                fdescript = fd;
                if (erro !== null) {
                    return errout({
                        name: "biddle_readBinary_stat_open",
                        error: erro
                    });
                }
                fs.read(fd, buffer, 0, length, 1, function biddle_readyBinary_stat_open_read(errr, read, buff) {
                    var bstring = "";
                    if (errr !== null) {
                        return errout({
                            name: "biddle_readBinary_stat_open_read",
                            error: errr
                        });
                    }
                    bstring = buff.toString("utf8", 0, buff.length);
                    bstring = bstring.slice(2, bstring.length - 2);
                    if ((/[\u0002-\u0008]|[\u000e-\u001f]/).test(bstring) === true) {
                        writeBinary();
                    } else {
                        fs.readFile(filePath, "utf8", function biddle_readBinary_stat_open_read_readFile(errf, fileData) {
                            if (errf !== null && errf !== undefined) {
                                return errout({
                                    name: "biddle_readBinary_stat_open_read_readFile",
                                    error: errf
                                });
                            }
                            if (data.command === "install" && (/(\.hash)$/).test(filePath) === true) {
                                data.hashFile = fileData;
                                callback(fileData);
                            } else {
                                apps.writeFile(fileData, filePath, callback);
                            }
                        });
                    }
                    return read;
                });
            });
        });
    };
    apps.help      = function biddle_help() {
        var file = "readme.md",
            size = input[2];
        if (data.command === "markdown") {
            file = input[2];
            size = input[3];
        }
        fs
            .readFile(file, "utf8", function biddle_help_readme(err, readme) {
                var lines = [],
                    list  = [],
                    ind   = "",
                    listr = "",
                    b     = 0,
                    len   = 0,
                    ens   = "\x1B[0m", //end - text formatting
                    bld   = "\x1B[1m", //text formatting - bold
                    itl   = "\x1B[3m", //text formatting - italics
                    und   = "\x1B[4m", //underline
                    enu   = "\x1B[24m", //end - underline
                    red   = "\x1B[31m", //color - red
                    grn   = "\x1B[32m", //color - green
                    tan   = "\x1B[33m", //color - tan
                    cyn   = "\x1B[36m", //color - cyan
                    enc   = "\x1B[39m", //end - color
                    parse = function biddle_help_readme_parse(listitem) {
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
                        if ((/\ {4}\S/).test(lines[b]) === true && listitem === false) {
                            lines[b] = grn + lines[b] + enc;
                            return;
                        }
                        chars.splice(0, 0, ind);
                        if (listitem === true) {
                            x = list.length;
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
                                } else if (chars[x - 1] === "]" && chars[x] === "(") {
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
                            ind = ind.slice(list.length * 2);
                        }
                    };
                if (err !== null && err !== undefined) {
                    return errout({
                        name: "biddle_help_readme",
                        error: err
                    });
                }
                readme = readme
                    .replace(/\r\n/g, "\n")
                    .replace(/\r/g, "\n");
                lines  = readme.split("\n");
                len    = lines.length;
                console.log("");
                for (b = 0; b < len; b += 1) {
                    if (lines[b].indexOf("#### ") === 0) {
                        list     = [];
                        ind      = "    ";
                        lines[b] = ind + und + bld + tan + lines[b].slice(5) + enc + ens + enu;
                        ind      = "      ";
                    } else if (lines[b].indexOf("### ") === 0) {
                        list     = [];
                        ind      = "  ";
                        lines[b] = ind + und + bld + grn + lines[b].slice(4) + enc + ens + enu;
                        ind      = "    ";
                    } else if (lines[b].indexOf("## ") === 0) {
                        list     = [];
                        ind      = "  ";
                        lines[b] = und + bld + cyn + lines[b].slice(3) + enc + ens + enu;
                    } else if (lines[b].indexOf("# ") === 0) {
                        list     = [];
                        ind      = "";
                        lines[b] = und + bld + red + lines[b].slice(2) + enc + ens + enu;
                    } else if ((/^(\s*\*\s)/).test(lines[b]) === true) {
                        listr = (/^(\s*\*\s)/).exec(lines[b])[0];
                        if (list.length === 0 || (list[list.length - 1] !== listr && list[list.length - 2] !== listr)) {
                            if ((/\s/).test(listr.charAt(0)) === true) {
                                list.push(listr);
                            } else {
                                list = [listr];
                            }
                        }
                        parse(true);
                        lines[b] = lines[b].replace("*", bld + red + "*" + enc + ens);
                    } else if ((/^(\s*-\s)/).test(lines[b]) === true) {
                        listr = (/^(\s*-\s)/).exec(lines[b])[0];
                        if (list.length === 0 || (list[list.length - 1] !== listr && list[list.length - 2] !== listr)) {
                            if ((/\s/).test(listr.charAt(0)) === true) {
                                list.push(listr);
                            } else {
                                list = [listr];
                            }
                        }
                        parse(true);
                        lines[b] = lines[b].replace("-", bld + red + "-" + enc + ens);
                    } else {
                        list = [];
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
        var status = {
                installed: false,
                published: false
            },
            start = function biddle_init_start() {
                if (data.command === "get") {
                    get(input[2], function biddle_init_start_getback(filedata) {
                        apps.writeFile(filedata, data.address.target + data.fileName, function biddle_init_start_getback_callback() {
                            return filedata;
                        });
                    });
                } else if (data.command === "install") {
                    install();
                } else if (data.command === "publish") {
                    publish();
                } else if (data.command === "unpublish") {
                    unpublish();
                } else if (data.command === "hash") {
                    apps
                        .hashCmd(input[2], "hashFile", function () {
                            console.log(data.hashFile);
                        });
                } else if (data.command === "help" || data.command === "" || data.command === undefined || data.command === "?" || data.command === "markdown") {
                    apps.help();
                } else if (isNaN(data.command) === false) {
                    input[1] = "help";
                    input[2] = data.command;
                    data.command = "help";
                    apps.help();
                } else {
                    errout({
                        name: "biddle_init_start",
                        error: "unrecognized command, \x1B[31m" + data.command + "\x1B[39m"
                    });
                }
            };
        data.fileName = apps.getFileName();
        fs.readFile(data.abspath + "installed.json", function biddle_init_installed(err, fileData) {
            var parsed = {};
            if (err !== null && err !== undefined) {
                return errout({
                    name: "biddle_init_installed",
                    error: err
                });
            }
            status.installed = true;
            parsed = JSON.parse(fileData);
            data.installed = parsed;
            if (status.published === true) {
                start();
            }
        });
        fs.readFile(data.abspath + "published.json", function biddle_init_published(err, fileData) {
            var parsed = {};
            if (err !== null && err !== undefined) {
                return errout({
                    name: "biddle_init_published",
                    error: err
                });
            }
            status.published = true;
            parsed = JSON.parse(fileData);
            data.published = parsed;
            if (status.installed === true) {
                start();
            }
        });
    }());
}());
