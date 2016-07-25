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
            address  : "",
            command  : input[1].toLowerCase(),
            fileName : "",
            hash     : "",
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
                fs.readFile(file, "utf8", function biddle_getpjson_callback(err, fileData) {
                    if (err !== null && err !== undefined) {
                        return errout({
                            name: "biddle_getpjson_callback",
                            error: err
                        });
                    }
                    data.packjson = JSON.parse(fileData);
                    callback();
                });
            },
            hashCmd  : function biddle_hashCmd(filepath, callback) {
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
                    data.hash = stdout;
                    callback();
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
                                                error: "Destination directory, '" + input[3] + "', is a file."
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
            readlist : function biddle_readlist() {
                var list = "";
                if (command === "publish" || (command === "list" && input[2] === "published")) {
                    list = "published";
                } else if (command === "installed" || command === "status" || (command === "list" && input[2] === "installed")) {
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
            rmrecurse: function biddle_rmrecurse(dirToKill) {
                var readdir = function biddle_rmrecurse_read(dirToRead) {
                    fs.readdir(dirToRead, function biddle_rmrecurse_read_readdir(err, files) {
                        if (err !== null) {
                            return errout({
                                name: "biddle_rmrecurse_read_readdir",
                                error: err
                            });
                        }
                    });
                };
            },
            writeFile: function biddle_initWriteFile() {
                return true;
            }
        },
        zip       = function biddle_zip(fileData) {
            var zipfunction = function biddle_zip_zipfunction() {
                var zipfile = "",
                    cmd     = "",
                    publish = function biddle_zip_zipfunction_publish() {
                        child(cmd, function biddle_zip_zipfunction_publish_child(err, stdout, stderr) {
                            if (err !== null) {
                                return errout({
                                    name: "biddle_zip_zipfunction_publish_child",
                                    error: err
                                });
                            }
                            if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                                return errout({
                                    name: "biddle_zip_zipfunction_publish_child",
                                    error: stderr
                                });
                            }
                            apps
                                .hashCmd(zipfile, function biddle_zip_zipfunction_publish_child_hash() {
                                    apps.writeFile(data.hash, zipfile.replace(".zip", ".hash"));
                                    if (data.published[data.packjson.name] === undefined) {
                                        data.published[data.packjson.name] = {};
                                        data.published[data.packjson.name].versions = [];
                                    }
                                    if (data.published[data.packjson.name].directory === undefined) {
                                        data.published[data.packjson.name].directory = data.address;
                                    }
                                    data.published[data.packjson.name].versions.push(data.packjson.version);
                                    apps.writeFile(JSON.stringify(data.published), "published.json");
                                });
                            return stdout;
                        });
                    };
                if (data.published[data.packjson.name] !== undefined && data.published[data.packjson.name].versions.indexOf(data.packjson.version) > -1) {
                    return errout({
                        name: "biddle_zip_zipfunction",
                        error: "Attempted to publish " + data.packjson.name + " over existing version " + data.packjson.version
                    });
                }
                if (data.command === "publish") {
                    zipfile = data.address + data.packjson.name + "_" + data.packjson.version + ".zip";
                }
                if (data.platform === "win32") {
                    if (data.command === "publish") {
                        cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::CreateFromDirectory('" + input[2] + "', '" + zipfile + "'); }\"";
                    } else {
                        cmd = "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" + zipfile + "', '" + input[2] + "'); }\"";
                    }
                } else {
                    if (data.command === "publish") {
                        cmd = "zip -r9yq " + zipfile + " " + input[2];
                    } else {
                        cmd = "";
                    }
                }
                if (data.command === "publish") {
                    apps.makedir(data.address, publish);
                }
            };
            apps.getpjson(zipfunction);
        },
        get       = function biddle_get() {
            var a        = (typeof input[2] === "string")
                    ? input[2].indexOf("s://")
                    : 0,
                file     = "",
                callback = function biddle_get_callback(res) {
                    res.setEncoding("utf8");
                    res.on("data", function biddle_get_callback_data(chunk) {
                        file += chunk;
                    });
                    res.on("end", function biddle_get_callback_end() {
                        var writeit = function biddle_get_callback_end_writeit() {
                            apps.writeFile(file, data.address + data.fileName);
                        };
                        if (res.statusCode !== 200) {
                            console.log(res.statusCode + " " + http.STATUS_CODES[res.statusCode] + ", for request " + input[2]);
                            if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location !== undefined) {
                                input[2] = res.headers.location;
                                data.fileName = apps.getFileName();
                                biddle_get();
                            }
                        } else if (data.command === "install") {
                            zip(file);
                        } else if (typeof input[3] === "string" && input[3].length > 0) {
                            apps.makedir(input[3], writeit);
                        } else {
                            apps.makedir(data.address, writeit);
                        }
                    });
                    res.on("error", function biddle_get_callback_error(error) {
                        console.log("Error downloading file via HTTP:");
                        console.log("");
                        console.log(error);
                    });
                };
            if (a > 0 && a < 10) {
                https.get(input[2], callback);
            } else {
                http.get(input[2], callback);
            }
        },
        uninstall = function biddle_uninstall() {

        };
    data.address   = (function biddle_address() {
        if (typeof input[3] === "string") {
            return input[3];
        }
        if (data.command === "get") {
            return data.abspath + "downloads" + path.sep;
        }
        if (data.command === "publish") {
            return data.abspath + "publications" + path.sep;
        }
    }());
    apps.writeFile = function biddle_writeFile(fileData, fileName) {
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
                            if (fileName !== "published.json" && fileName !== "installed.json") {
                                console.log("File " + fileName + " written at " + apps.commas(stat.size) + " bytes.");
                            }
                        });
                }
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
                if (data.command === "get" || data.command === "install") {
                    get();
                } else if (data.command === "publish") {
                    zip();
                } else if (data.command === "unpublish") {
                    uninstall();
                } else if (data.command === "hash") {
                    apps
                        .hashCmd(input[2], function () {
                            console.log(data.hash);
                        });
                } else if (data.command === "help" || data.command === "" || data.command === undefined || data.command === "?" || data.command === "markdown") {
                    apps.help();
                } else {
                    errout({
                        name: "biddle_init_start",
                        error: "unrecognized command '" + data.command + "'"
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
