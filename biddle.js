/*jshint laxbreak: true*/
/*jslint node: true, for: true*/
(function biddle() {
    "use strict";
    var node     = {
            child: require("child_process").exec,
            fs   : require("fs"),
            http : require("http"),
            https: require("https"),
            path : require("path")
        },
        commands = { // The list of supported biddle commands.
            commands : "List the supported commands to the console.",
            copy     : "Copy files or directory trees from location to another on the local file system.",
            get      : "Get something via http/https.",
            global   : "Make biddle a global command in the terminal.",
            hash     : "Generate a hash sequence against a file.",
            help     : "Parse biddle's readme.md to the terminal.",
            install  : "Install a published application.",
            list     : "List installed and/or published applications.",
            markdown : "Parse any markdown and output to terminal.",
            publish  : "Publish an application/version.",
            remove   : "Remove a file or directory from the local file system.",
            status   : "Determine if version on installed applications are behind the latest published v" +
                          "ersion.",
            test     : "Test automation.",
            uninstall: "Uninstall an application installed by biddle.",
            unpublish: "Unpublish an application published by biddle.",
            unzip    : "Unzip a zip file.",
            zip      : "Zip a file or directory."
        },
        data     = {
            abspath      : "", // Local absolute path to biddle.
            address      : {
                downloads: "", // Local absolute path to biddle download directory.
                target   : "" // Location where files will be written to.
            },
            childtest    : false, // If the current biddle instance is a child of another biddle instance (occurs due to test automation)
            command      : "", // Executed biddle command.
            cwd          : process.cwd(), // Current working directory before running biddle.
            filename     : "", // Stores an inferred file name when files need to be written and a package.json is not used, such as the get command.
            hashFile     : "", // Stores hash value from reading a downloaded hash file.  Used for hash comparison with the install command.
            hashZip      : "", // Stores locally computed hash value for a downloaded zip file.  Used for hash comparison with the install command.
            ignore       : [], // List of relative locations to ignore from the .biddleignore file.
            input        : [], // Normalized process.argv list.
            installed    : {}, // Parsed data of the installed.json file.  Data about applications installed with biddle.
            latestVersion: false, // Used in the publish command to determine if the application is the latest version
            packjson     : {}, // Parsed data of a directory's package.json file.  Used with the publish command.
            published    : {} // Parsed data of the published.json file.  Data about applications published by biddle.
        },
        cmds     = { // The OS specific commands executed outside Node.js
            cmdFile   : function biddle_cmds_cmdFile() { // Used in command global to write a cmd (batch/bin) file for windows
                return "@IF EXIST \"%~dp0\\node.exe\" (\r\n  \"%~dp0\\node.exe\" \"" + data.abspath + "bin\\biddle\" %*\r\n) ELSE (\r\n  node \"" + data.abspath + "bin\\biddle\" %*\r\n)";
            },
            copy      : function biddle_cmds_copy(location) { // Copy file system components from one location into a different location
                if (data.platform === "win32") {
                    return "xcopy \"" + data.input[2] + "\" \"" + location + "\" /E /Q /G /H /Y /J /I";
                }
                return "cp -R " + data.input[2] + " " + location;
            },
            hash      : function biddle_cmds_hash(file) { // Generates a hash sequence against a file
                if (data.platform === "darwin") {
                    return "shasum -a 512 " + file;
                }
                if (data.platform === "win32") {
                    return "certUtil -hashfile \"" + file + "\" SHA512";
                }
                return "sha512sum " + file;
            },
            pathRead  : function biddle_cmds_pathRead() { // Used in command global to read the OS's stored paths
                return "powershell.exe -nologo -noprofile -command \"[Environment]::GetEnvironmentVariab" +
                        "le('PATH','Machine');\"";
            },
            pathRemove: function biddle_cmds_pathRemove(cmdFile) { // Used in command global to remove the biddle path from the Windows path list
                return "powershell.exe -nologo -noprofile -command \"$PATH='" + cmdFile + "';[Environment]::SetEnvironmentVariable('PATH',$PATH,'Machine');\"";
            },
            pathSet   : function biddle_cmds_pathSet() { // Used in command global to add the biddle path to the Windows path list
                return "powershell.exe -nologo -noprofile -command \"$PATH=[Environment]::GetEnvironment" +
                        "Variable('PATH');[Environment]::SetEnvironmentVariable('PATH',$PATH + ';" + data.abspath + "cmd','Machine');\"";
            },
            remove    : function biddle_cmds_remove(dir) { // Recursively and forcefully removes a directory tree or file from the file system
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"rm " + dir + " -r -force\"";
                }
                return "rm -rf " + dir;
            },
            unzip     : function biddle_cmds_unzip() { // Unzips a zip archive into a collection
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compress" +
                            "ion.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" + data.input[2] + "', '" + data.address.target + "'); }\"";
                }
                return "unzip -oq " + data.input[2] + " -d " + data.address.target;
            },
            zip       : function biddle_cmds_zip(filename) { // Stores all items of the given directory into a zip archive directly without creating a new directory. Locations resolved by a symlink are stored, but the actual symlink is not stored.
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compress" +
                            "ion.FileSystem'; [IO.Compression.ZipFile]::CreateFromDirectory('.', '" + filename + "'); }\"";
                }
                return "zip -r9yq " + filename + " ." + node.path.sep + " *.[!.]";
            }
        },
        apps     = {};
    apps.commands    = function biddle_commands() {
        var keys = Object.keys(commands),
            len  = keys.length,
            comm = "",
            lens = 0,
            a    = 0,
            b    = 0;
        console.log("\u001b[4mbiddle Commands\u001b[0m");
        console.log("");
        do {
            if (keys[a].length > lens) {
                lens = keys[a].length;
            }
            a += 1;
        } while (a < len);
        a = 0;
        do {
            comm = keys[a];
            b    = comm.length;
            if (b < lens) {
                do {
                    comm = comm + " ";
                    b    += 1;
                } while (b < lens);
            }
            console.log("\u001b[36m" + comm + "\u001b[39m: " + commands[keys[a]]);
            a += 1;
        } while (a < len);
    };
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
    apps.copy        = function biddle_copy() {
        node
            .child(cmds.copy(data.input[3]), function biddle_copy_child(er, stdout, stder) {
                if (er !== null) {
                    return apps.errout({error: er, name: "biddle_copy_child"});
                }
                if (stder !== null && stder !== "") {
                    return apps.errout({error: stder, name: "biddle_copy_child"});
                }
                console.log("Copied " + apps.relToAbs(data.input[2]) + " to " + apps.relToAbs(data.input[3]));
                return stdout;
            });
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
            if (errData.name.indexOf("biddle_test") === 0) {
                data.published.biddletesta = {
                    directory: data.abspath + "publications" + node.path.sep + "biddletesta"
                };
                data.installed.biddletesta = {
                    location: data.abspath + "applications" + node.path.sep + "biddletesta"
                };
                data.input[2]              = "biddletesta";
                apps.unpublish(true);
                apps.uninstall(true);
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
                        console.log("");
                        console.log("Please report defects to https://github.com/prettydiff/biddle/issues");
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
                apps.makedir(addy, function biddle_get_localZip() {
                    node.child(cmds.copy("downloads"), callback);
                });
            } else if (data.command === "status") {
                apps
                    .readBinary(url, function biddle_get_readLocal(filedata, filepath) {
                        callback(filedata, filepath);
                    });
            } else {
                apps
                    .readBinary(url, function biddle_get_readLocal(filedata) {
                        callback(filedata);
                    });
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
        if ((/^(https?:\/\/)/).test(data.input[2]) === true) {
            output = data
                .input[2]
                .replace(/^(https?:\/\/)/, "");
            if (output.indexOf("?") > 0) {
                output = output.slice(0, output.indexOf("?"));
            }
            paths  = output.split("/");
        } else {
            paths = data
                .input[2]
                .replace(/^(\/|\\)+/, "")
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
        return apps.sanitizef(output);
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
                if (typeof data.packjson.name !== "string" || data.packjson.name.length < 1) {
                    return apps.errout({error: "The package.json file is missing the required \u001b[31mname\u001b[39m property.", name: "biddle_getpjson_readfile"});
                }
                if (typeof data.packjson.version !== "string" || data.packjson.version.length < 1) {
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
                data.packjson.name = apps.sanitizef(data.packjson.name);
                callback();
            });
    };
    apps.hashCmd     = function biddle_hashCmd(filepath, store, callback) {
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
                    .child(cmds.hash(filepath), function biddle_hashCmd_stat_child(err, stdout, stderr) {
                        if (err !== null) {
                            return apps.errout({error: err, name: "biddle_hashCmd_stat_child"});
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                            return apps.errout({error: stderr, name: "biddle_hashCmd_stat_child"});
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
                    bullet = "",
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
                    parse  = function biddle_help_readme_parse(item, listitem, cell) {
                        var block = false,
                            chars = [],
                            final = 0,
                            s     = (/\s/),
                            x     = 0,
                            y     = ind.length,
                            start = 0,
                            index = 0,
                            math  = 0,
                            endln = 0,
                            quote = "",
                            wrap  = function biddle_help_readme_parse_wrap(tick) {
                                var z      = x,
                                    format = function biddle_help_readme_parse_wrap_format(eol) {
                                        if (block === true) {
                                            chars[eol] = "\n" + ind + "| ";
                                        } else {
                                            chars[eol] = "\n" + ind;
                                        }
                                        index = 1 + y + eol;
                                        if (chars[eol - 1] === " ") {
                                            chars[eol - 1] = "";
                                        } else if (chars[eol + 1] === " ") {
                                            chars.splice(eol + 1, 1);
                                            final -= 1;
                                        }
                                    };
                                if (cell === true) {
                                    return;
                                }
                                if (tick === true) {
                                    do {
                                        z -= 1;
                                    } while (chars[z + 1].indexOf("\u001b[32m") < 0 && z > index);
                                    if (z > index) {
                                        format(z);
                                    }
                                } else if (s.test(chars[x]) === true) {
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
                        if ((/\u0020{4}\S/).test(item) === true && listitem === false) {
                            item = grn + item + enc;
                            return item;
                        }
                        if (item.charAt(0) === ">") {
                            block = true;
                        }
                        if (listitem === true) {
                            item = item.replace(/^\s+/, "");
                        }
                        chars = item
                            .replace(/^(\s*>\s*)/, ind + "| ")
                            .replace(/`/g, "bix~")
                            .split("");
                        final = chars.length;
                        if (cell === true) {
                            start = 0;
                        } else {
                            if (block === true) {
                                chars.splice(0, 0, "  ");
                            }
                            if (listitem === true || block === true) {
                                x = listly.length;
                                do {
                                    x   -= 1;
                                    y   += 2;
                                    ind = ind + "  ";
                                } while (x > 0);
                            }
                            if (block === false) {
                                if (listitem === true) {
                                    chars.splice(0, 0, ind.slice(2));
                                } else {
                                    chars.splice(0, 0, ind);
                                }
                            }
                            start = y - 1;
                        }
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
                                } else if (chars[x] === "_" && chars[x + 1] === "_") {
                                    quote = "__";
                                    chars.splice(x, 2);
                                    chars[x] = bld + chars[x];
                                    final    -= 2;
                                } else if (chars[x] === "*" && ((x === start && chars[x + 1] !== " ") || x > start)) {
                                    quote = "*";
                                    chars.splice(x, 1);
                                    chars[x] = itl + tan + chars[x];
                                    final    -= 1;
                                } else if (chars[x] === "_" && ((x === start && chars[x + 1] !== " ") || x > start)) {
                                    quote = "_";
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
                                if (chars[x] === undefined) {
                                    x = chars.length - 1;
                                }
                                chars[x] = chars[x] + enc;
                                final    -= 4;
                                if (math > 1 && chars[x + 1] === " ") {
                                    x += 1;
                                    wrap(false);
                                }
                            } else if (chars[x] === ")" && quote === ")") {
                                quote    = "";
                                chars[x] = enc + chars[x];
                                if (math > 1 && chars[x + 1] === " ") {
                                    x += 1;
                                    wrap(false);
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
                            } else if (chars[x] === "_" && chars[x + 1] === "_" && quote === "__") {
                                quote = "";
                                chars.splice(x, 2);
                                chars[x - 1] = chars[x - 1] + ens;
                                final        -= 2;
                            } else if (chars[x] === "_" && quote === "_") {
                                quote = "";
                                chars.splice(x, 1);
                                chars[x - 1] = chars[x - 1] + enc + ens;
                                final        -= 1;
                            }
                            if (math > 1) {
                                if (quote === "`") {
                                    wrap(true);
                                } else {
                                    wrap(false);
                                }
                            }
                            if (chars[x + 1] === undefined) {
                                break;
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
                        item = chars.join("");
                        if (block === true) {
                            ind = ind.slice(2);
                        } else if (listitem === true) {
                            ind = ind.slice(listly.length * 2);
                        }
                        return item;
                    },
                    table  = function biddle_help_readme_table() {
                        var rows = [
                                lines[b]
                                    .replace(/^\|/, "")
                                    .replace(/\|$/, "")
                                    .split("|")
                            ],
                            lens = rows[0].length,
                            cols = [],
                            c    = 0,
                            d    = 0,
                            e    = 0,
                            lend = 0,
                            line = "";
                        c    = b + 2;
                        line = lines[c]
                            .replace(/^\|/, "")
                            .replace(/\|$/, "");
                        d    = 0;
                        do {
                            rows[0][d] = parse(rows[0][d].replace(/\s+/g, " ").replace(/^\s/, "").replace(/\s$/, ""), false, true);
                            lend         = rows[0][d]
                                .replace(/\u001b\[\d+m/g, "")
                                .length;
                            cols.push(lend);
                            d += 1;
                        } while (d < lens);
                        if (line.indexOf("|") > -1) {
                            do {
                                rows.push(line.split("|").slice(0, lens));
                                d = 0;
                                do {
                                    rows[rows.length - 1][d] = parse(rows[rows.length - 1][d].replace(/\s+/g, " ").replace(/^\s/, "").replace(/\s$/, ""), false, true);
                                    lend                       = rows[rows.length - 1][d]
                                        .replace(/\u001b\[\d+m/g, "")
                                        .length;
                                    if (lend > cols[d]) {
                                        cols[d] = lend;
                                    }
                                    if (rows[rows.length - 1][d] === "\u2713") {
                                        rows[rows.length - 1][d] = "\u001b[1m\u001b[32m\u2713\u001b[39m\u001b[0m";
                                    } else if (rows[rows.length - 1][d] === "X") {
                                        rows[rows.length - 1][d] = "\u001b[1m\u001b[31mX\u001b[39m\u001b[0m";
                                    } else if (rows[rows.length - 1][d] === "?") {
                                        rows[rows.length - 1][d] = "\u001b[1m\u001b[33m?\u001b[39m\u001b[0m";
                                    }
                                    d += 1;
                                } while (d < lens);
                                c += 1;
                                if (c === len) {
                                    break;
                                }
                                line = lines[c]
                                    .replace(/^\|/, "")
                                    .replace(/\|$/, "");
                            } while (line.indexOf("|") > -1);
                        }
                        c    = 0;
                        lend = rows.length;
                        do {
                            d = 0;
                            do {
                                e = rows[c][d]
                                    .replace(/\u001b\[\d+m/g, "")
                                    .length;
                                if (d === lens - 1 && rows[c][d].length < cols[d]) {
                                    do {
                                        e          += 1;
                                        rows[c][d] = rows[c][d] + " ";
                                    } while (e < cols[d]);
                                } else {
                                    do {
                                        e          += 1;
                                        rows[c][d] = rows[c][d] + " ";
                                    } while (e < cols[d] + 1);
                                }
                                if (c === 0) {
                                    if (d > 0) {
                                        rows[c][d] = "\u001b[4m " + rows[c][d] + "\u001b[0m";
                                    } else {
                                        rows[c][d] = ind + "\u001b[4m" + rows[c][d] + "\u001b[0m";
                                    }
                                } else {
                                    if (d > 0) {
                                        rows[c][d] = " " + rows[c][d];
                                    } else {
                                        rows[c][d] = ind + rows[c][d];
                                    }
                                }
                                d += 1;
                            } while (d < lens);
                            output.push(rows[c].join(""));
                            c += 1;
                            b += 1;
                        } while (c < lend);
                        b += 1;
                    };
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_help_readme"});
                }
                readme = (function biddle_help_readme_removeImages() {
                    var readout = [],
                        j       = readme.split(""),
                        i       = 0,
                        ilen    = j.length,
                        brace   = "",
                        code    = (j[0] === " " && j[1] === " " && j[2] === " " && j[3] === " ");
                    for (i = 0; i < ilen; i += 1) {
                        if (brace === "") {
                            if (j[i] === "\r") {
                                if (j[i + 1] === "\n") {
                                    j[i] = "";
                                } else {
                                    j[i] = "\n";
                                }
                                if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === " " && j[i + 4] === " ") {
                                    code = true;
                                } else {
                                    code = false;
                                }
                            } else if (j[i] === "\n") {
                                if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === " " && j[i + 4] === " ") {
                                    code = true;
                                } else {
                                    code = false;
                                }
                            } else if (j[i] === "`") {
                                brace = "`";
                                code  = true;
                            } else if (j[i] === "!" && j[i + 1] === "[") {
                                brace    = "]";
                                j[i]     = "";
                                j[i + 1] = "";
                            } else if (j[i] === "]" && j[i + 1] === "(") {
                                j[i] = ", ";
                            } else if (j[i] === "[" && code === false) {
                                j[i] = "";
                            } else if (j[i] === ")" && j[i + 1] === " " && (/\s/).test(j[i + 2]) === false) {
                                j[i] = "),";
                            }
                        } else if (brace === j[i]) {
                            if (brace === "`") {
                                code = false;
                            } else {
                                j[i] = "";
                            }
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
                    if (lines[b].slice(1).indexOf("|") > -1 && (/---+\|---+/).test(lines[b + 1]) === true) {
                        table();
                    } else if (lines[b].indexOf("#### ") === 0) {
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
                    } else if ((/^(\s*(\*|-)\s)/).test(lines[b]) === true) {
                        listr = (/^(\s*)/).exec(lines[b])[0];
                        if (listly.length === 0 || listly[listly.length - 1] < listr.length) {
                            if ((/\s/).test(listr.charAt(0)) === true) {
                                listly.push(listr.length);
                            } else {
                                listly = [listr.length];
                            }
                        } else if (listly.length > 1 && listr.length < listly[listly.length - 1]) {
                            do {
                                listly.pop();
                            } while (listly.length > 1 && listr.length < listly[listly.length - 1]);
                        }
                        if (listly.length % 2 > 0) {
                            bullet = "*";
                        } else {
                            bullet = "-";
                        }
                        lines[b] = parse(lines[b], true, false).replace(/\*|-/, bld + red + bullet + enc + ens);
                    } else if ((/^\s*>/).test(lines[b]) === true) {
                        listly   = [];
                        lines[b] = parse(lines[b], false, false);
                        if (b < len - 1 && (/^(\s*)$/).test(lines[b + 1]) === false) {
                            lines[b + 1] = ">" + lines[b + 1];
                        }
                    } else {
                        listly = [];
                        if (lines[b].length > 0) {
                            lines[b] = parse(lines[b], false, false);
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
                late: false,
                zip : false
            },
            late        = (function biddle_install_late() {
                var sep  = ((/^(https?:\/\/)/).test(data.input[2]) === true)
                        ? "/"
                        : node.path.sep,
                    dirs = data
                        .input[2]
                        .split(sep);
                dirs.pop();
                return dirs.join(sep) + sep + "latest.txt";
            }()),
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
                                    data.installed[data.packjson.name]           = {};
                                    data.installed[data.packjson.name].location  = data.address.target;
                                    data.installed[data.packjson.name].version   = data.packjson.version;
                                    data.installed[data.packjson.name].published = ((/^(https?:\/\/)/i).test(data.input[2]) === true)
                                        ? data
                                            .input[2]
                                            .slice(0, data.input[2].lastIndexOf("/") + 1)
                                        : apps.relToAbs(data.input[2].slice(0, data.input[2].lastIndexOf(node.path.sep) + 1));
                                    apps.writeFile(JSON.stringify(data.installed), data.abspath + "installed.json", function biddle_install_compareHash_hashCmd_installedJSON() {
                                        status.packjson = true;
                                        if (status.remove === true) {
                                            complete();
                                        }
                                    });
                                    apps.rmrecurse(data.abspath + "downloads" + node.path.sep + data.fileName, function biddle_install_compareHash_hashCmd_remove() {
                                        status.remove = true;
                                        if (status.packjson === true) {
                                            complete();
                                        }
                                    });
                                }, {
                                    location: apps.relToAbs(data.input[2]),
                                    name    : ""
                                });
                        } else {
                            console.log("\u001b[31mHashes don't match\u001b[39m for " + data.input[2] + ". File is saved in the downloads directory and will not be installed.");
                            console.log("Generated hash - " + data.hashZip);
                            console.log("Requested hash - " + data.hashFile);
                        }
                    });
            };
        apps.get(data.input[2], function biddle_install_getzip(fileData) {
            flag.zip = true;
            if (flag.hash === true && flag.late === true) {
                compareHash(fileData);
            }
        });
        apps.get(data.input[2].replace(".zip", ".hash"), function biddle_install_gethash(fileData) {
            flag.hash = true;
            if (flag.zip === true && flag.late === true) {
                compareHash(fileData);
            }
        });
        apps.get(late, function biddle_install_getlate(fileData) {
            var dirs = data
                    .address
                    .target
                    .split(node.path.sep),
                name = "";
            if (dirs[dirs.length - 1] === "") {
                dirs.pop();
            }
            name = dirs[dirs.length - 1];
            if (typeof data.installed[name] === "object" && data.installed[name].version === fileData) {
                return apps.errout({
                    error: "This application is already installed at version \u001b[36m" + fileData + "\u001b[39m. To continue uninstall the application and try again: \u001b[32mbiddl" +
                            "e uninstall " + name + "\u001b[39m",
                    name : "biddle_install_getlate"
                });
            }
            flag.late = true;
            if (flag.zip === true && flag.hash === true) {
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
                var len    = 0,
                    a      = 0,
                    proper = (type === "published")
                        ? "Published"
                        : "Installed",
                    vert   = (type === "published")
                        ? "latest"
                        : "version",
                    loct   = (type === "published")
                        ? "directory"
                        : "location",
                    pads   = {},
                    pad    = function biddle_list_dolist_pad(item, col) {
                        var b = item.length;
                        if (b === pads[col]) {
                            return item;
                        }
                        do {
                            item = item + " ";
                            b    += 1;
                        } while (b < pads[col]);
                        return item;
                    };
                listtype[type].sort();
                if (listtype[type].length === 0) {
                    console.log("\u001b[4m" + proper + " applications:\u001b[0m");
                    console.log("");
                    console.log("No applications are " + type + " by biddle.");
                    console.log("");
                } else {
                    console.log("\u001b[4m" + proper + " applications:\u001b[0m");
                    console.log("");
                    len          = listtype[type].length;
                    pads.name    = 0;
                    pads.version = 0;
                    a            = 0;
                    do {
                        if (listtype[type][a].length > pads.name) {
                            pads.name = listtype[type][a].length;
                        }
                        if (data[type][listtype[type][a]][vert].length > pads.version) {
                            pads.version = data[type][listtype[type][a]][vert].length;
                        }
                        a += 1;
                    } while (a < len);
                    a = 0;
                    do {
                        console.log("* \u001b[36m" + pad(listtype[type][a], "name") + "\u001b[39m - " + pad(data[type][listtype[type][a]][vert], "version") + " - " + data[type][listtype[type][a]][loct]);
                        a += 1;
                    } while (a < len);
                    console.log("");
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
            return node.child(cmds.pathRead(), function biddle_makeGlobal_winRead(er, stdout, stder) {
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
                        return node.child(cmds.pathRemove(remove), function biddle_makeGlobal_winRead_winRemovePath(erw, stdoutw, stderw) {
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
                    .child(cmds.pathSet(), function biddle_makeGlobal_winRead_winWritePath(erw, stdoutw, stderw) {
                        if (erw !== null) {
                            return apps.errout({error: erw, name: "biddle_makeGlobal_winRead_winWritePath"});
                        }
                        if (stderw !== null && stderw !== "") {
                            return apps.errout({error: stderw, name: "biddle_makeGlobal_winRead_winWritePath"});
                        }
                        console.log(data.abspath + "cmd added to %PATH% and immediately avialable.");
                        apps.makedir(data.abspath + "cmd", function biddle_makeGlobal_winRead_winWritePath_winMakeDir() {
                            apps
                                .writeFile(cmds.cmdFile(), data.abspath + "cmd\\biddle.cmd", function biddle_makeGlobal_winRead_winWritePath_winMakeDir_winWriteCmd() {
                                    console.log(data.abspath + "cmd\\biddle.cmd written. Please restart your terminal.");
                                });
                        });
                        return stdoutw;
                    });
            });
        }
        node
            .child("echo ~", function biddle_makeGlobal_findHome(erh, stdouth, stderh) {
                var flag     = {
                        bash_profile: false,
                        profile     : false
                    },
                    terminal = function biddle_makeGlobal_findHome_terminal() {
                        if (data.input[2] === "remove") {
                            return console.log(data.abspath + "bin removed from $PATH but will remain available until the terminal is restarted" +
                                    ".");
                        }
                        console.log("Restart the terminal or execute:  export PATH=" + data.abspath + "bin:$PATH");
                    },
                    readPath = function biddle_makeGlobal_findHome_readPath(dotfile) {
                        node
                            .fs
                            .readFile(dotfile, "utf8", function biddle_makeGlobal_findHome_readPath_nixRead(err, filedata) {
                                var pathStatement = "\nexport PATH=\"" + data.abspath + "bin:$PATH\"\n";
                                if (err !== null && err !== undefined) {
                                    return apps.errout({error: err, name: "biddle_makeGlobal_findHome_nixStat_nixRead"});
                                }
                                if (filedata.indexOf(data.abspath + "bin") > -1) {
                                    if (data.input[2] === "remove") {
                                        return apps.writeFile(filedata.replace(pathStatement, ""), dotfile, function biddle_makeGlobal_findHome_readPath_nixRead_nixRemove() {
                                            console.log("Path updated in " + dotfile);
                                            if (dotfile.indexOf("bash_profile") > 0) {
                                                flag.bash_profile = true;
                                                if (flag.profile === true) {
                                                    terminal();
                                                }
                                            } else {
                                                flag.profile = true;
                                                if (flag.bash_profile === true) {
                                                    terminal();
                                                }
                                            }
                                        });
                                    }
                                    return apps.errout({
                                        error: data.abspath + "bin is already in $PATH",
                                        name : "biddle_makeGlobal_findHome_readPath_nixRead"
                                    });
                                }
                                if (data.input[2] === "remove") {
                                    return apps.errout({
                                        error: data.abspath + "bin is not present in $PATH",
                                        name : "biddle_makeGlobal_findHome_readPath_nixRead"
                                    });
                                }
                                apps
                                    .writeFile(filedata + pathStatement, dotfile, function biddle_makeGlobal_findHome_readPath_nixRead_nixRemove() {
                                        console.log("Path updated in " + dotfile);
                                        if (dotfile.indexOf("bash_profile") > 0) {
                                            flag.bash_profile = true;
                                            if (flag.profile === true) {
                                                terminal();
                                            }
                                        } else {
                                            flag.profile = true;
                                            if (flag.bash_profile === true) {
                                                terminal();
                                            }
                                        }
                                    });
                            });
                    };
                if (erh !== null) {
                    return apps.errout({error: erh, name: "biddle_makeGlobal_findHome"});
                }
                if (stderh !== null && stderh !== "") {
                    return apps.errout({error: stderh, name: "biddle_makeGlobal_findHome"});
                }
                stdouth = stdouth.replace(/\s+/g, "") + "/.";
                node
                    .fs
                    .stat(stdouth + "profile", function biddle_cmds_makeGlobal_findHome_nixStatProfile(er) {
                        if (er !== null) {
                            if (er.toString().indexOf("no such file or directory") > 1) {
                                flag.profile = true;
                                if (flag.bash_profile === true) {
                                    terminal();
                                }
                            } else {
                                return apps.errout({error: er, name: "biddle_cmds_makeGlobal_findHome_nixStatProfile"});
                            }
                        } else {
                            readPath(stdouth + "profile");
                        }
                    });
                node
                    .fs
                    .stat(stdouth + "bash_profile", function biddle_cmds_makeGlobal_findHome_nixStatBash(er) {
                        if (er !== null) {
                            if (er.toString().indexOf("no such file or directory") > 1) {
                                flag.bash_profile = true;
                                if (flag.profile === true) {
                                    terminal();
                                }
                            } else {
                                return apps.errout({error: er, name: "biddle_cmds_makeGlobal_findHome_nixStatBash"});
                            }
                        } else {
                            readPath(stdouth + "bash_profile");
                        }
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
                                    apps
                                        .writeFile(JSON.stringify(data.published), data.abspath + "published.json", function biddle_publish_zippy_zip_hash_writeJSON() {
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
                    variants = (typeof data.packjson.publication_variants === "object")
                        ? Object.keys(data.packjson.publication_variants)
                        : [];
                variants.push("");
                apps.makedir("temp", function biddle_publish_execution_variantDir() {
                    variants
                        .forEach(function biddle_publish_execution_variantsDir_each(value) {
                            var varobj = (value === "")
                                ? {}
                                : data.packjson.publication_variants[value];
                            value = apps.sanitizef(value);
                            node.child(cmds.copy(data.abspath + "temp" + node.path.sep + value), function biddle_publish_execution_variantsDir_each_copy(er, stdout, stder) {
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
            },
            preexec   = function biddle_publish_preexec() {
                if (data.address.target.indexOf(node.path.sep + "publications") + 1 === data.address.target.length - 13) {
                    data.address.target = data.address.target + apps.sanitizef(data.packjson.name) + node.path.sep;
                }
                apps
                    .makedir(data.address.target, function biddle_publish_preexec_makedir() {
                        if (data.latestVersion === true) {
                            data.published[data.packjson.name].latest = data.packjson.version;
                            apps.writeFile(data.packjson.version, data.address.target + "latest.txt", function biddle_zip_makedir_latestTXT() {
                                execution();
                            });
                        } else {
                            execution();
                        }
                    });
            };
        apps.getpjson(function biddle_publish_callback() {
            if (data.published[data.packjson.name] !== undefined && data.published[data.packjson.name].versions.indexOf(data.packjson.version) > -1) {
                return apps.errout({
                    error: "Attempted to publish " + data.packjson.name + " over existing version " + data.packjson.version,
                    name : "biddle_publish_execution"
                });
            }
            if (data.published[data.packjson.name] !== undefined && data.input[3] !== undefined) {
                data.input = data
                    .input
                    .slice(0, 3);
            } else if (data.published[data.packjson.name] === undefined) {
                data.published[data.packjson.name]           = {};
                data.published[data.packjson.name].versions  = [];
                data.published[data.packjson.name].latest    = "";
                data.published[data.packjson.name].directory = data.address.target + apps.sanitizef(data.packjson.name) + node.path.sep;
            }
            data
                .published[data.packjson.name]
                .versions
                .push(data.packjson.version);
            data.latestVersion = (function biddle_publish_callback_latestVersion() {
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
            flag.getpjson      = true;
            if (flag.ignore === true) {
                preexec();
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
                            preexec();
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
                    preexec();
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
                                            } else if (data.command === "status") {
                                                callback(fileData, filePath);
                                            } else if (data.command === "install" && (/(latest\.txt)$/).test(filePath) === true) {
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
        node
            .child(cmds.remove(dirToKill), function biddle_rmrecurse_child(err, stdout, stderrout) {
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
    apps.status      = function biddle_status() {
        var list       = [],
            versions   = {},
            a          = 0,
            b          = 0,
            len        = 0,
            single     = false,
            name       = function biddle_status_name(pub) {
                var dirs = [];
                if ((/^(https?:\/\/)/i).test(pub) === true) {
                    dirs = pub.split("/");
                    dirs.pop();
                    return dirs.pop();
                }
                dirs = pub.split(node.path.sep);
                dirs.pop();
                return dirs.pop();
            },
            compare    = function biddle_status_compare() {
                var keys     = Object.keys(versions),
                    klen     = keys.length,
                    k        = 0,
                    currents = [],
                    outs     = [];
                keys.sort();
                do {
                    if (data.installed[keys[k]].version === versions[keys[k]]) {
                        currents.push("* " + keys[k] + " matches published version \u001b[36m" + versions[keys[k]] + "\u001b[39m");
                    } else {
                        outs.push("* " + keys[k] + " is installed at version \u001b[1m\u001b[31m" + data.installed[keys[k]].version + "\u001b[39m\u001b[0m but published version is \u001b[36m" + versions[keys[k]] + "\u001b[39m");
                    }
                    k += 1;
                } while (k < klen);
                klen = outs.length;
                if (klen > 0) {
                    if (single === false) {
                        console.log("");
                        if (currents.length < 1) {
                            console.log("\u001b[4m\u001b[31mAll Applications Outdated:\u001b[39m\u001b[0m");
                        } else {
                            console.log("\u001b[4mOutdated Applications:\u001b[0m");
                        }
                    }
                    console.log("");
                    k = 0;
                    do {
                        console.log(outs[k]);
                        k += 1;
                    } while (k < klen);
                }
                klen = currents.length;
                if (klen > 0) {
                    if (single === false) {
                        console.log("");
                        if (outs.length < 1) {
                            console.log("\u001b[4m\u001b[32mAll Applications Are Current:\u001b[39m\u001b[0m");
                        } else {
                            console.log("\u001b[4mCurrent Applications:\u001b[0m");
                        }
                    }
                    console.log("");
                    k = 0;
                    do {
                        console.log(currents[k]);
                        k += 1;
                    } while (k < klen);
                }
            },
            getversion = function biddle_status_get(filedata, filepath) {
                versions[name(filepath)] = filedata;
                b                        += 1;
                if (b === len) {
                    compare();
                }
            };
        if (data.input[2] !== undefined) {
            if (data.installed[data.input[2]] !== undefined) {
                list   = [data.input[2]];
                single = true;
            } else {
                return apps.errout({
                    error: data.input[2] + " is not a biddle installed application.",
                    name : "biddle_status"
                });
            }
        } else {
            list = Object.keys(data.installed);
            if (list.length < 1) {
                return apps.errout({error: "No applications installed by biddle.", name: "biddle_status"});
            }
        }
        len = list.length;
        do {
            apps.get(data.installed[list[a]].published + "latest.txt", getversion);
            a += 1;
        } while (a < len);
    };
    apps.test        = function biddle_test() {
        var startTime = Date.now(),
            order     = [
                "moduleInstall",
                "lint",
                "hash",
                "copy",
                "remove",
                "markdown",
                "get",
                "zip",
                "unzip",
                "publish",
                "install",
                "listStatus",
                "uninstall",
                "unpublish"
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
            childcmd  = (data.platform === "win32")
                ? (data.abspath === process.cwd().toLowerCase() + node.path.sep)
                    ? "node " + data.abspath + "biddle "
                    : "biddle "
                : (data.abspath === process.cwd() + node.path.sep)
                    ? "node " + data.abspath + "biddle "
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
                copy         : function biddle_test_copy() {
                    node
                        .child(childcmd + "copy " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "biddletesta.js " + testpath + " childtest", function biddle_test_copy_child(er, stdout, stder) {
                            var copytest = "Copied " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "biddletesta.js to " + data.abspath + "unittest",
                                copyfile = data.abspath + "unittest" + node.path.sep + "biddletesta.js";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_copy_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_copy_child", stdout: stdout, time: humantime(true)});
                            }
                            stdout = stdout.replace(/(\s+)$/, "");
                            if (stdout !== copytest) {
                                return diffFiles("biddle_test_copy_child", stdout, copytest);
                            }
                            node
                                .fs
                                .stat(copyfile, function biddle_test_copy_child_stat(ers, stats) {
                                    if (ers !== null) {
                                        return apps.errout({error: ers, name: "biddle_test_copy_child_stat", stdout: stdout, time: humantime(true)});
                                    }
                                    if (stats === undefined || stats.isFile() === false) {
                                        return apps.errout({
                                            error : "copy failed as " + copyfile + " is not present",
                                            name  : "biddle_test_copy_child_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    console.log(humantime(false) + " \u001b[32mcopy test passed.\u001b[39m");
                                    next();
                                });
                        });
                },
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
                            if ((/^(((File)|(\d{3}))\u0020)/).test(stdout) === false || stdout.indexOf("File\u0020") < 0 || stdout.indexOf(" 0 bytes") > 0 || size.replace(" bytes.", "").length < 4) {
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
                install      : function biddle_test_install() {
                    node
                        .child(childcmd + "install " + data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep + "biddletesta_latest.zip childtest", function biddle_test_install_child(er, stdout, stder) {
                            var instfile = data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep + "liba" + node.path.sep + "libab.txt";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_hash_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_hash_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stdout.indexOf("is missing the \u001b[36mhttp(s)\u001b[39m scheme, treating as a local path...") < 7) {
                                return apps.errout({
                                    error : "Expected output to contain: is missing the \u001b[36mhttp(s)\u001b[39m scheme, t" +
                                               "reating as a local path...",
                                    name  : "biddle_test_install_child",
                                    stdout: stdout,
                                    time  : humantime(true)
                                });
                            }
                            node
                                .fs
                                .stat(instfile, function biddle_test_install_child_stat(err, stats) {
                                    if (err !== null) {
                                        return apps.errout({error: err, name: "biddle_test_hash_child_stat", stdout: stdout, time: humantime(true)});
                                    }
                                    if (typeof stats !== "object" || stats.isFile() === false) {
                                        return apps.errout({
                                            error : instfile + " does not exist.",
                                            name  : "biddle_test_hash_child_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    console.log(humantime(false) + " \u001b[32mFile from install is present:\u001b[39m " + instfile);
                                    node
                                        .fs
                                        .readFile(data.abspath + "installed.json", function biddle_test_install_child_stat_readJSON(era, filedata) {
                                            var inst = {};
                                            if (era !== null && era !== undefined) {
                                                return apps.errout({
                                                    error : instfile + " does not exist.",
                                                    name  : "biddle_test_hash_child_stat_readJSON",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            inst = JSON.parse(filedata);
                                            if (inst.biddletesta === undefined) {
                                                return apps.errout({error: "biddletesta is absent from installed.json", name: "biddle_test_hash_child_stat_readJSON", stdout: stdout, time: humantime(true)});
                                            }
                                            if (inst.biddletesta.version !== "99.99.1234") {
                                                return apps.errout({error: "Expected biddletesta.version of installed.json to be '99.99.1234'.", name: "biddle_test_hash_child_stat_readJSON", stdout: stdout, time: humantime(true)});
                                            }
                                            console.log(humantime(false) + " \u001b[32minstalled.json contains biddletesta.\u001b[39m");
                                            console.log(humantime(false) + " \u001b[32minstall test passed.\u001b[39m");
                                            next();
                                        });
                                });
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
                            endread   = 0,
                            startdir  = 0,
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
                                        if (endread === startread && enddir === startdir) {
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
                                                    if (stat.isFile() === true && (/(\.js)$/).test(filename) === true) {
                                                        startread += 1;
                                                        readFile(filename);
                                                    }
                                                    if (stat.isDirectory() === true) {
                                                        do {
                                                            if (filename === ignoreDirectory[a]) {
                                                                if (endread === startread && enddir === startdir) {
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
                                        enddir += 1;
                                        list.forEach(fileEval);
                                    });
                            };
                        readDir(data.abspath);
                    }());
                },
                listStatus   : function biddle_test_listStatus() {
                    var listcmds  = [
                            "publish " + data.abspath + "test" + node.path.sep + "biddletestb",
                            "install " + data.abspath + "publications" + node.path.sep + "biddletestb" + node.path.sep + "biddletestb_latest.zip",
                            "list",
                            "list published",
                            "list installed",
                            "status",
                            "status biddletesta",
                            "status biddletesta",
                            "status",
                            "uninstall biddletestb",
                            "unpublish biddletestb"
                        ],
                        changed   = false,
                        listChild = function biddle_test_listStatus_childWrapper() {
                            node
                                .child(childcmd + listcmds[0] + " childtest", function biddle_test_listStatus_childWrapper_child(er, stdout, stder) {
                                    var listout = "\u001b[4mInstalled applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m -" +
                                                " 99.99.1234 - " + data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "applications" + node.path.sep + "biddletestb" + node.path.sep + "\n\n\u001b[4mPublished applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[3" +
                                                "9m - 99.99.1234 - " + data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "publications" + node.path.sep + "biddletestb" + node.path.sep,
                                        listpub = "\u001b[4mPublished applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m -" +
                                                " 99.99.1234 - " + data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "publications" + node.path.sep + "biddletestb" + node.path.sep,
                                        listist = "\u001b[4mInstalled applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m -" +
                                                " 99.99.1234 - " + data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "applications" + node.path.sep + "biddletestb" + node.path.sep,
                                        statout = "\n\u001b[4m\u001b[32mAll Applications Are Current:\u001b[39m\u001b[0m\n\n* biddl" +
                                                "etesta matches published version \u001b[36m99.99.1234\u001b[39m\n* biddletestb m" +
                                                "atches published version \u001b[36m98.98.1234\u001b[39m",
                                        statpba = "\n* biddletesta matches published version \u001b[36m99.99.1234\u001b[39m",
                                        statpbb = "\n\u001b[4mOutdated Applications:\u001b[0m\n\n* biddletesta is installed at vers" +
                                                "ion \u001b[1m\u001b[31m99.99.1234\u001b[39m\u001b[0m but published version is " +
                                                "\u001b[36m11.22.6789\u001b[39m\n\n\u001b[4mCurrent Applications:\u001b[0m\n\n* b" +
                                                "iddletestb matches published version \u001b[36m98.98.1234\u001b[39m",
                                        statpbc = "\n* biddletesta is installed at version \u001b[1m\u001b[31m99.99.1234\u001b[39m" +
                                                "\u001b[0m but published version is \u001b[36m11.22.6789\u001b[39m";
                                    if (er !== null) {
                                        return apps.errout({
                                            error : er,
                                            name  : "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    if (stder !== null && stder !== "") {
                                        return apps.errout({
                                            error : stder,
                                            name  : "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    stdout = stdout
                                        .replace(/(\s+)$/, "")
                                        .replace(/\r\n/g, "\n");
                                    if (changed === false && listcmds[0] === "list") {
                                        if (stdout !== listout) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, listout);
                                        }
                                        console.log(humantime(false) + " \u001b[32mlist output passed.\u001b[39m");
                                    }
                                    if (changed === false && listcmds[0] === "list published") {
                                        if (stdout !== listpub) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, listpub);
                                        }
                                        console.log(humantime(false) + " \u001b[32mlist published output passed.\u001b[39m");
                                    }
                                    if (changed === false && listcmds[0] === "list installed") {
                                        if (stdout !== listist) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, listist);
                                        }
                                        console.log(humantime(false) + " \u001b[32mlist installed output passed.\u001b[39m");
                                    }
                                    if (changed === false && listcmds[0] === "status") {
                                        if (stdout !== statout) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, statout);
                                        }
                                        console.log(humantime(false) + " \u001b[32mstatus output passed.\u001b[39m");
                                    }
                                    if (changed === true && listcmds[0] === "status") {
                                        if (stdout !== statpbb) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, statpbb);
                                        }
                                        console.log(humantime(false) + " \u001b[32mstatus outdated output passed.\u001b[39m");
                                    }
                                    if (changed === true && listcmds[0] === "status biddletesta") {
                                        if (stdout !== statpbc) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, statpbc);
                                        }
                                        console.log(humantime(false) + " \u001b[32mstatus outdated biddletesta output passed.\u001b[39m");
                                    }
                                    if (changed === false && listcmds[0] === "status biddletesta") {
                                        if (stdout !== statpba) {
                                            return diffFiles("biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout, statpba);
                                        }
                                        console.log(humantime(false) + " \u001b[32mstatus biddletesta output passed.\u001b[39m");
                                        apps.writeFile("11.22.6789", data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep + "latest.txt", function biddle_test_listStatus_childWrapper_child_changeVersion() {
                                            changed = true;
                                            listcmds.splice(0, 1);
                                        });
                                    } else {
                                        listcmds.splice(0, 1);
                                    }
                                    if (listcmds.length > 0) {
                                        biddle_test_listStatus_childWrapper();
                                    } else {
                                        console.log(humantime(false) + " \u001b[32mlist and status tests passed.\u001b[39m");
                                        next();
                                    }
                                });
                        };
                    listChild();
                },
                markdown     : function biddle_test_markdown() {
                    var flag = {
                        "120": false,
                        "60" : false,
                        "80" : false
                    };
                    node.child(childcmd + "markdown " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "READMEa.md 60 childtest", function biddle_test_markdown_60(er, stdout, stder) {
                        var markdowntest = "\n\u001b[4m\u001b[1m\u001b[31mtest README\u001b[39m\u001b[0m\u001b[24m\nsome dum" +
                                         "my subtext\n\n\u001b[4m\u001b[1m\u001b[36mFirst Secondary Heading\u001b[39m" +
                                         "\u001b[0m\u001b[24m\n    | a big block quote lives here. This is where I\n    | " +
                                         "am going to experience with wrapping a block quote a bit\n    | differently from" +
                                         " other content.  I need enough text in\n    | this quote to wrap a couple of tim" +
                                         "es, so I will continue\n    | adding some nonsense and as long as it takes to en" +
                                         "sure I\n    | have a fully qualified test.\n    | New line in a block quote\n   " +
                                         " | More block\n\n  This is a regular paragraph that needs to be long\n  enough t" +
                                         "o wrap a couple times.  This text will be unique\n  from the text in the block q" +
                                         "uote because uniqueness saves\n  time when debugging test failures.  I am now wr" +
                                         "iting a\n  bunch of wrapping paragraph gibberish, such as\n  f324fasdaowkefsdva." +
                                         "  That one isn't even a word.  It isn't\n  cool if it doesn't contain a hyperlin" +
                                         "k,\n  (\u001b[36mhttp://tonowhwere.nothing\u001b[39m), in some text.\n\n  \u001b" +
                                         "[1m\u001b[31m*\u001b[39m\u001b[0m list item 1 these also need to wrap like a\n  " +
                                         "  paragraph. So blah blah wrapping some madness into a\n    list item right gosh" +
                                         " darn here and let's see what shakes\n    out of the coolness.\n  \u001b[1m" +
                                         "\u001b[31m*\u001b[39m\u001b[0m list item 2 these also need to wrap like a\n    p" +
                                         "aragraph. So blah blah wrapping some madness into a\n    list item right gosh da" +
                                         "rn here and let's see what shakes\n    out of the coolness.\n    \u001b[1m\u001b" +
                                         "[31m-\u001b[39m\u001b[0m sublist item 1 these also need to wrap like a\n      pa" +
                                         "ragraph. So blah blah wrapping some madness into a\n      list item right gosh d" +
                                         "arn here and let's see what\n      shakes out of the coolness.\n    \u001b[1m" +
                                         "\u001b[31m-\u001b[39m\u001b[0m sublist item 2 these also need to wrap like a\n  " +
                                         "    paragraph. So blah blah wrapping some madness into a\n      list item right " +
                                         "gosh darn here and let's see what\n      shakes out of the coolness.\n      " +
                                         "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsublist item 1 these also need to wra" +
                                         "p\n        like a paragraph. So blah blah wrapping some madness\n        into a " +
                                         "list item right gosh darn here and let's see\n        what shakes out of the coo" +
                                         "lness.\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsublist item 2 these al" +
                                         "so need to wrap\n        like a paragraph. So blah blah wrapping some madness\n " +
                                         "       into a list item right gosh darn here and let's see\n        what shakes " +
                                         "out of the coolness.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 3 thes" +
                                         "e also need to wrap like a\n    paragraph. So blah blah wrapping some madness in" +
                                         "to a\n    list item right gosh darn here and let's see what shakes\n    out of t" +
                                         "he coolness.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m boo these also need to" +
                                         " wrap like a paragraph.\n      So blah blah wrapping some madness into a list it" +
                                         "em\n      right gosh darn here and let's see what shakes out of\n      the cooln" +
                                         "ess.\n\n  \u001b[4m\u001b[1m\u001b[32mFirst Tertiary Heading\u001b[39m\u001b[0m" +
                                         "\u001b[24m\n    This text should be extra indented.\n\n    \u001b[1m\u001b[31m*" +
                                         "\u001b[39m\u001b[0m list item 1\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m lis" +
                                         "t item 2\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 1\n      " +
                                         "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 2\n        \u001b[1m\u001b[" +
                                         "31m*\u001b[39m\u001b[0m subsublist item 1\n        \u001b[1m\u001b[31m*\u001b[39" +
                                         "m\u001b[0m subsublist item 2\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list i" +
                                         "tem 3\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m boo\n\n    \u001b[4m\u001b[" +
                                         "1m\u001b[33mGettin Deep with the Headings\u001b[39m\u001b[0m\u001b[24m\n\n      " +
                                         "  | a big block quote lives here. This\n        | is where I am going to experie" +
                                         "nce with wrapping a\n        | block quote a bit differently from other content." +
                                         "  I\n        | need enough text in this quote to wrap a couple of\n        | tim" +
                                         "es, so I will continue adding some nonsense and\n        | as long as it takes t" +
                                         "o ensure I have a fully\n        | qualified test.\n        | New line in a bloc" +
                                         "k quote\n        | More block\n\n      Images get converted to their alt text\n " +
                                         "     description.\n\n      This is a regular paragraph that needs to be\n      l" +
                                         "ong enough to wrap a couple times.  This text will be\n      unique from the tex" +
                                         "t in the block quote because\n      uniqueness saves time when debugging test fa" +
                                         "ilures.  I\n      am now writing a bunch of wrapping paragraph\n      gibberish," +
                                         " such as f324fasdaowkefsdva.  That one isn't\n      even a word.\n\n      \u001b" +
                                         "[1m\u001b[31m*\u001b[39m\u001b[0m list item 1 these also need to wrap like\n    " +
                                         "    a paragraph. So blah blah wrapping some madness into\n        a list item ri" +
                                         "ght gosh darn here and let's see what\n        shakes out of the coolness.\n    " +
                                         "  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 2 these also need to wrap li" +
                                         "ke\n        a paragraph. So blah blah wrapping some madness into\n        a list" +
                                         " item right gosh darn here and let's see what\n        shakes out of the coolnes" +
                                         "s.\n        \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 1 these also ne" +
                                         "ed to\n          wrap like a paragraph. So blah blah wrapping some\n          ma" +
                                         "dness into a list item right gosh darn here and\n          let's see what shakes" +
                                         " out of the coolness.\n        \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist i" +
                                         "tem 2 these also need to\n          wrap like a paragraph. So blah blah wrapping" +
                                         " some\n          madness into a list item right gosh darn here and\n          le" +
                                         "t's see what shakes out of the coolness.\n          \u001b[1m\u001b[31m*\u001b[3" +
                                         "9m\u001b[0m subsublist item 1 these also need\n            to wrap like a paragr" +
                                         "aph. So blah blah wrapping\n            some madness into a list item right gosh" +
                                         " darn\n            here and let's see what shakes out of the\n            coolne" +
                                         "ss.\n          \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsublist item 2 these a" +
                                         "lso need\n            to wrap like a paragraph. So blah blah wrapping\n         " +
                                         "   some madness into a list item right gosh darn\n            here and let's see" +
                                         " what shakes out of the\n            coolness.\n      \u001b[1m\u001b[31m*\u001b" +
                                         "[39m\u001b[0m list item 3 these also need to wrap like\n        a paragraph. So " +
                                         "blah blah wrapping some madness into\n        a list item right gosh darn here a" +
                                         "nd let's see what\n        shakes out of the coolness.\n        \u001b[1m\u001b[" +
                                         "31m-\u001b[39m\u001b[0m boo these also need to wrap like a\n          paragraph." +
                                         " So blah blah wrapping some madness into\n          a list item right gosh darn " +
                                         "here and let's see\n          what shakes out of the coolness.\n\n      \u001b[4" +
                                         "mCommand   \u001b[0m\u001b[4m Local \u001b[0m\u001b[4m Argument Type            " +
                                         "   \u001b[0m\u001b[4m Second Argument \u001b[0m\n      copy       \u001b[1m" +
                                         "\u001b[32m✓\u001b[39m\u001b[0m      file path or directory path  directory path " +
                                         "\n      get        \u001b[1m\u001b[33m?\u001b[39m\u001b[0m      file path       " +
                                         "             none           \n      global     \u001b[1m\u001b[32m✓\u001b[39m" +
                                         "\u001b[0m      none                         none           \n      hash       " +
                                         "\u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path                    none  " +
                                         "         \n      help       \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      number " +
                                         "                      none           \n      install    \u001b[1m\u001b[33m?" +
                                         "\u001b[39m\u001b[0m      zip file                     directory path \n      lis" +
                                         "t       \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      \"\u001b[3m\u001b[33minstal" +
                                         "led\u001b[39m\u001b[0m\" or \"\u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m\" " +
                                         "  none           \n      markdown   \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m     " +
                                         " path to markdown file        number         \n      publish    \u001b[1m\u001b[" +
                                         "32m✓\u001b[39m\u001b[0m      directory path               directory path \n     " +
                                         " remove     \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path or directory " +
                                         "path  none           \n      status     \u001b[1m\u001b[33m?\u001b[39m\u001b[0m " +
                                         "     none or application name     none           \n      test       \u001b[1m" +
                                         "\u001b[31mX\u001b[39m\u001b[0m      none                         none           " +
                                         "\n      uninstall  \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      application name" +
                                         "             none           \n      unpublish  \u001b[1m\u001b[32m✓\u001b[39m" +
                                         "\u001b[0m      application name             none           \n      unzip      " +
                                         "\u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      path to zip file             direct" +
                                         "ory path \n      zip        \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file pa" +
                                         "th or directory path  directory path \n\n\u001b[4m\u001b[1m\u001b[36mNew big Hea" +
                                         "ding\u001b[39m\u001b[0m\u001b[24m\n  paragraph here to see if indentation is lar" +
                                         "gely reset\n  appropriate to the current heading that is bigger than the\n  prev" +
                                         "ious headings",
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
                            .replace(/(\s+)$/, "")
                            .replace(/(\\(\w+)?\s*)$/, "");
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
                        var markdowntest = "\n\u001b[4m\u001b[1m\u001b[31mtest README\u001b[39m\u001b[0m\u001b[24m\nsome dum" +
                                         "my subtext\n\n\u001b[4m\u001b[1m\u001b[36mFirst Secondary Heading\u001b[39m" +
                                         "\u001b[0m\u001b[24m\n    | a big block quote lives here. This is where I am goin" +
                                         "g to\n    | experience with wrapping a block quote a bit differently from other " +
                                         "content.\n    | I need enough text in this quote to wrap a couple of times, so I" +
                                         " will\n    | continue adding some nonsense and as long as it takes to ensure I h" +
                                         "ave a\n    | fully qualified test.\n    | New line in a block quote\n    | More " +
                                         "block\n\n  This is a regular paragraph that needs to be long enough to wrap a co" +
                                         "uple\n  times.  This text will be unique from the text in the block quote becaus" +
                                         "e\n  uniqueness saves time when debugging test failures.  I am now writing a bun" +
                                         "ch\n  of wrapping paragraph gibberish, such as f324fasdaowkefsdva.  That one isn" +
                                         "'t\n  even a word.  It isn't cool if it doesn't contain a hyperlink,\n  (\u001b[" +
                                         "36mhttp://tonowhwere.nothing\u001b[39m), in some text.\n\n  \u001b[1m\u001b[31m*" +
                                         "\u001b[39m\u001b[0m list item 1 these also need to wrap like a paragraph. So bla" +
                                         "h blah\n    wrapping some madness into a list item right gosh darn here and let'" +
                                         "s see\n    what shakes out of the coolness.\n  \u001b[1m\u001b[31m*\u001b[39m" +
                                         "\u001b[0m list item 2 these also need to wrap like a paragraph. So blah blah\n  " +
                                         "  wrapping some madness into a list item right gosh darn here and let's see\n   " +
                                         " what shakes out of the coolness.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m s" +
                                         "ublist item 1 these also need to wrap like a paragraph. So blah\n      blah wrap" +
                                         "ping some madness into a list item right gosh darn here and let's\n      see wha" +
                                         "t shakes out of the coolness.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m subli" +
                                         "st item 2 these also need to wrap like a paragraph. So blah\n      blah wrapping" +
                                         " some madness into a list item right gosh darn here and let's\n      see what sh" +
                                         "akes out of the coolness.\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsubl" +
                                         "ist item 1 these also need to wrap like a paragraph.\n        So blah blah wrapp" +
                                         "ing some madness into a list item right gosh darn here\n        and let's see wh" +
                                         "at shakes out of the coolness.\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m su" +
                                         "bsublist item 2 these also need to wrap like a paragraph.\n        So blah blah " +
                                         "wrapping some madness into a list item right gosh darn here\n        and let's s" +
                                         "ee what shakes out of the coolness.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m l" +
                                         "ist item 3 these also need to wrap like a paragraph. So blah blah\n    wrapping " +
                                         "some madness into a list item right gosh darn here and let's see\n    what shake" +
                                         "s out of the coolness.\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m boo these al" +
                                         "so need to wrap like a paragraph. So blah blah\n      wrapping some madness into" +
                                         " a list item right gosh darn here and let's see\n      what shakes out of the co" +
                                         "olness.\n\n  \u001b[4m\u001b[1m\u001b[32mFirst Tertiary Heading\u001b[39m\u001b[" +
                                         "0m\u001b[24m\n    This text should be extra indented.\n\n    \u001b[1m\u001b[31m" +
                                         "*\u001b[39m\u001b[0m list item 1\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m li" +
                                         "st item 2\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 1\n      " +
                                         "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 2\n        \u001b[1m\u001b[" +
                                         "31m*\u001b[39m\u001b[0m subsublist item 1\n        \u001b[1m\u001b[31m*\u001b[39" +
                                         "m\u001b[0m subsublist item 2\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list i" +
                                         "tem 3\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m boo\n\n    \u001b[4m\u001b[" +
                                         "1m\u001b[33mGettin Deep with the Headings\u001b[39m\u001b[0m\u001b[24m\n\n      " +
                                         "  | a big block quote lives here. This is where I am going\n        | to experie" +
                                         "nce with wrapping a block quote a bit differently from other\n        | content." +
                                         "  I need enough text in this quote to wrap a couple of times, so\n        | I wi" +
                                         "ll continue adding some nonsense and as long as it takes to ensure I\n        | " +
                                         "have a fully qualified test.\n        | New line in a block quote\n        | Mor" +
                                         "e block\n\n      Images get converted to their alt text description.\n\n      Th" +
                                         "is is a regular paragraph that needs to be long enough to wrap a\n      couple t" +
                                         "imes.  This text will be unique from the text in the block quote\n      because " +
                                         "uniqueness saves time when debugging test failures.  I am now\n      writing a b" +
                                         "unch of wrapping paragraph gibberish, such as\n      f324fasdaowkefsdva.  That o" +
                                         "ne isn't even a word.\n\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item" +
                                         " 1 these also need to wrap like a paragraph. So blah\n        blah wrapping some" +
                                         " madness into a list item right gosh darn here and\n        let's see what shake" +
                                         "s out of the coolness.\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item " +
                                         "2 these also need to wrap like a paragraph. So blah\n        blah wrapping some " +
                                         "madness into a list item right gosh darn here and\n        let's see what shakes" +
                                         " out of the coolness.\n        \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist i" +
                                         "tem 1 these also need to wrap like a paragraph.\n          So blah blah wrapping" +
                                         " some madness into a list item right gosh darn\n          here and let's see wha" +
                                         "t shakes out of the coolness.\n        \u001b[1m\u001b[31m-\u001b[39m\u001b[0m s" +
                                         "ublist item 2 these also need to wrap like a paragraph.\n          So blah blah " +
                                         "wrapping some madness into a list item right gosh darn\n          here and let's" +
                                         " see what shakes out of the coolness.\n          \u001b[1m\u001b[31m*\u001b[39m" +
                                         "\u001b[0m subsublist item 1 these also need to wrap like a\n            paragrap" +
                                         "h. So blah blah wrapping some madness into a list item right\n            gosh d" +
                                         "arn here and let's see what shakes out of the coolness.\n          \u001b[1m" +
                                         "\u001b[31m*\u001b[39m\u001b[0m subsublist item 2 these also need to wrap like a" +
                                         "\n            paragraph. So blah blah wrapping some madness into a list item rig" +
                                         "ht\n            gosh darn here and let's see what shakes out of the coolness.\n " +
                                         "     \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 3 these also need to wrap" +
                                         " like a paragraph. So blah\n        blah wrapping some madness into a list item " +
                                         "right gosh darn here and\n        let's see what shakes out of the coolness.\n  " +
                                         "      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m boo these also need to wrap like a" +
                                         " paragraph. So blah\n          blah wrapping some madness into a list item right" +
                                         " gosh darn here and\n          let's see what shakes out of the coolness.\n\n   " +
                                         "   \u001b[4mCommand   \u001b[0m\u001b[4m Local \u001b[0m\u001b[4m Argument Type " +
                                         "              \u001b[0m\u001b[4m Second Argument \u001b[0m\n      copy       " +
                                         "\u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path or directory path  direct" +
                                         "ory path \n      get        \u001b[1m\u001b[33m?\u001b[39m\u001b[0m      file pa" +
                                         "th                    none           \n      global     \u001b[1m\u001b[32m✓" +
                                         "\u001b[39m\u001b[0m      none                         none           \n      has" +
                                         "h       \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path                  " +
                                         "  none           \n      help       \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m     " +
                                         " number                       none           \n      install    \u001b[1m\u001b[" +
                                         "33m?\u001b[39m\u001b[0m      zip file                     directory path \n     " +
                                         " list       \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      \"\u001b[3m\u001b[33min" +
                                         "stalled\u001b[39m\u001b[0m\" or \"\u001b[3m\u001b[33mpublished\u001b[39m\u001b[0" +
                                         "m\"   none           \n      markdown   \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m " +
                                         "     path to markdown file        number         \n      publish    \u001b[1m" +
                                         "\u001b[32m✓\u001b[39m\u001b[0m      directory path               directory path " +
                                         "\n      remove     \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path or dir" +
                                         "ectory path  none           \n      status     \u001b[1m\u001b[33m?\u001b[39m" +
                                         "\u001b[0m      none or application name     none           \n      test       " +
                                         "\u001b[1m\u001b[31mX\u001b[39m\u001b[0m      none                         none  " +
                                         "         \n      uninstall  \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      applica" +
                                         "tion name             none           \n      unpublish  \u001b[1m\u001b[32m✓" +
                                         "\u001b[39m\u001b[0m      application name             none           \n      unz" +
                                         "ip      \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      path to zip file           " +
                                         "  directory path \n      zip        \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m     " +
                                         " file path or directory path  directory path \n\n\u001b[4m\u001b[1m\u001b[36mNew" +
                                         " big Heading\u001b[39m\u001b[0m\u001b[24m\n  paragraph here to see if indentatio" +
                                         "n is largely reset appropriate to the\n  current heading that is bigger than the" +
                                         " previous headings",
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
                            .replace(/(\s+)$/, "")
                            .replace(/(\\(\w+)?\s*)$/, "");
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
                        var markdowntest = "\n\u001b[4m\u001b[1m\u001b[31mtest README\u001b[39m\u001b[0m\u001b[24m\nsome dum" +
                                         "my subtext\n\n\u001b[4m\u001b[1m\u001b[36mFirst Secondary Heading\u001b[39m" +
                                         "\u001b[0m\u001b[24m\n    | a big block quote lives here. This is where I am goin" +
                                         "g to experience with wrapping a block quote a bit\n    | differently from other " +
                                         "content.  I need enough text in this quote to wrap a couple of times, so I will " +
                                         "continue\n    | adding some nonsense and as long as it takes to ensure I have a " +
                                         "fully qualified test.\n    | New line in a block quote\n    | More block\n\n  Th" +
                                         "is is a regular paragraph that needs to be long enough to wrap a couple times.  " +
                                         "This text will be unique from the\n  text in the block quote because uniqueness " +
                                         "saves time when debugging test failures.  I am now writing a bunch of\n  wrappin" +
                                         "g paragraph gibberish, such as f324fasdaowkefsdva.  That one isn't even a word. " +
                                         " It isn't cool if it doesn't\n  contain a hyperlink, (\u001b[36mhttp://tonowhwer" +
                                         "e.nothing\u001b[39m), in some text.\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m" +
                                         " list item 1 these also need to wrap like a paragraph. So blah blah wrapping som" +
                                         "e madness into a list item\n    right gosh darn here and let's see what shakes o" +
                                         "ut of the coolness.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 2 these" +
                                         " also need to wrap like a paragraph. So blah blah wrapping some madness into a l" +
                                         "ist item\n    right gosh darn here and let's see what shakes out of the coolness" +
                                         ".\n    \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 1 these also need to" +
                                         " wrap like a paragraph. So blah blah wrapping some madness into a list\n      it" +
                                         "em right gosh darn here and let's see what shakes out of the coolness.\n    " +
                                         "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 2 these also need to wrap l" +
                                         "ike a paragraph. So blah blah wrapping some madness into a list\n      item righ" +
                                         "t gosh darn here and let's see what shakes out of the coolness.\n      \u001b[1m" +
                                         "\u001b[31m*\u001b[39m\u001b[0m subsublist item 1 these also need to wrap like a " +
                                         "paragraph. So blah blah wrapping some madness into a\n        list item right go" +
                                         "sh darn here and let's see what shakes out of the coolness.\n      \u001b[1m" +
                                         "\u001b[31m*\u001b[39m\u001b[0m subsublist item 2 these also need to wrap like a " +
                                         "paragraph. So blah blah wrapping some madness into a\n        list item right go" +
                                         "sh darn here and let's see what shakes out of the coolness.\n  \u001b[1m\u001b[3" +
                                         "1m*\u001b[39m\u001b[0m list item 3 these also need to wrap like a paragraph. So " +
                                         "blah blah wrapping some madness into a list item\n    right gosh darn here and l" +
                                         "et's see what shakes out of the coolness.\n    \u001b[1m\u001b[31m-\u001b[39m" +
                                         "\u001b[0m boo these also need to wrap like a paragraph. So blah blah wrapping so" +
                                         "me madness into a list item right\n      gosh darn here and let's see what shake" +
                                         "s out of the coolness.\n\n  \u001b[4m\u001b[1m\u001b[32mFirst Tertiary Heading" +
                                         "\u001b[39m\u001b[0m\u001b[24m\n    This text should be extra indented.\n\n    " +
                                         "\u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 1\n    \u001b[1m\u001b[31m*" +
                                         "\u001b[39m\u001b[0m list item 2\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m s" +
                                         "ublist item 1\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 2\n   " +
                                         "     \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsublist item 1\n        \u001b[1" +
                                         "m\u001b[31m*\u001b[39m\u001b[0m subsublist item 2\n    \u001b[1m\u001b[31m*" +
                                         "\u001b[39m\u001b[0m list item 3\n      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m b" +
                                         "oo\n\n    \u001b[4m\u001b[1m\u001b[33mGettin Deep with the Headings\u001b[39m" +
                                         "\u001b[0m\u001b[24m\n\n        | a big block quote lives here. This is where I a" +
                                         "m going to experience with wrapping a block\n        | quote a bit differently f" +
                                         "rom other content.  I need enough text in this quote to wrap a couple of times, " +
                                         "so I\n        | will continue adding some nonsense and as long as it takes to en" +
                                         "sure I have a fully qualified test.\n        | New line in a block quote\n      " +
                                         "  | More block\n\n      Images get converted to their alt text description.\n\n " +
                                         "     This is a regular paragraph that needs to be long enough to wrap a couple t" +
                                         "imes.  This text will be unique\n      from the text in the block quote because " +
                                         "uniqueness saves time when debugging test failures.  I am now writing a\n      b" +
                                         "unch of wrapping paragraph gibberish, such as f324fasdaowkefsdva.  That one isn'" +
                                         "t even a word.\n\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 1 thes" +
                                         "e also need to wrap like a paragraph. So blah blah wrapping some madness into a " +
                                         "list\n        item right gosh darn here and let's see what shakes out of the coo" +
                                         "lness.\n      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 2 these also nee" +
                                         "d to wrap like a paragraph. So blah blah wrapping some madness into a list\n    " +
                                         "    item right gosh darn here and let's see what shakes out of the coolness.\n  " +
                                         "      \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 1 these also need to " +
                                         "wrap like a paragraph. So blah blah wrapping some madness into\n          a list" +
                                         " item right gosh darn here and let's see what shakes out of the coolness.\n     " +
                                         "   \u001b[1m\u001b[31m-\u001b[39m\u001b[0m sublist item 2 these also need to wra" +
                                         "p like a paragraph. So blah blah wrapping some madness into\n          a list it" +
                                         "em right gosh darn here and let's see what shakes out of the coolness.\n        " +
                                         "  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsublist item 1 these also need to w" +
                                         "rap like a paragraph. So blah blah wrapping some\n            madness into a lis" +
                                         "t item right gosh darn here and let's see what shakes out of the coolness.\n    " +
                                         "      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m subsublist item 2 these also need " +
                                         "to wrap like a paragraph. So blah blah wrapping some\n            madness into a" +
                                         " list item right gosh darn here and let's see what shakes out of the coolness.\n" +
                                         "      \u001b[1m\u001b[31m*\u001b[39m\u001b[0m list item 3 these also need to wra" +
                                         "p like a paragraph. So blah blah wrapping some madness into a list\n        item" +
                                         " right gosh darn here and let's see what shakes out of the coolness.\n        " +
                                         "\u001b[1m\u001b[31m-\u001b[39m\u001b[0m boo these also need to wrap like a parag" +
                                         "raph. So blah blah wrapping some madness into a list item\n          right gosh " +
                                         "darn here and let's see what shakes out of the coolness.\n\n      \u001b[4mComma" +
                                         "nd   \u001b[0m\u001b[4m Local \u001b[0m\u001b[4m Argument Type               " +
                                         "\u001b[0m\u001b[4m Second Argument \u001b[0m\n      copy       \u001b[1m\u001b[3" +
                                         "2m✓\u001b[39m\u001b[0m      file path or directory path  directory path \n      " +
                                         "get        \u001b[1m\u001b[33m?\u001b[39m\u001b[0m      file path               " +
                                         "     none           \n      global     \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m  " +
                                         "    none                         none           \n      hash       \u001b[1m" +
                                         "\u001b[32m✓\u001b[39m\u001b[0m      file path                    none           " +
                                         "\n      help       \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      number          " +
                                         "             none           \n      install    \u001b[1m\u001b[33m?\u001b[39m" +
                                         "\u001b[0m      zip file                     directory path \n      list       " +
                                         "\u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      \"\u001b[3m\u001b[33minstalled" +
                                         "\u001b[39m\u001b[0m\" or \"\u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m\"   n" +
                                         "one           \n      markdown   \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      pa" +
                                         "th to markdown file        number         \n      publish    \u001b[1m\u001b[32m" +
                                         "✓\u001b[39m\u001b[0m      directory path               directory path \n      re" +
                                         "move     \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path or directory pat" +
                                         "h  none           \n      status     \u001b[1m\u001b[33m?\u001b[39m\u001b[0m    " +
                                         "  none or application name     none           \n      test       \u001b[1m\u001b" +
                                         "[31mX\u001b[39m\u001b[0m      none                         none           \n    " +
                                         "  uninstall  \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      application name      " +
                                         "       none           \n      unpublish  \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m" +
                                         "      application name             none           \n      unzip      \u001b[1m" +
                                         "\u001b[32m✓\u001b[39m\u001b[0m      path to zip file             directory path " +
                                         "\n      zip        \u001b[1m\u001b[32m✓\u001b[39m\u001b[0m      file path or dir" +
                                         "ectory path  directory path \n\n\u001b[4m\u001b[1m\u001b[36mNew big Heading" +
                                         "\u001b[39m\u001b[0m\u001b[24m\n  paragraph here to see if indentation is largely" +
                                         " reset appropriate to the current heading that is bigger than the\n  previous he" +
                                         "adings",
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
                            .replace(/(\s+)$/, "")
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
                            modules[mod].name = "\u001b[32m" + modules[mod].name + "\u001b[39m";
                            if (modules[mod].name.length > longname) {
                                longname = modules[mod].name.length;
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
                        var modout         = function biddle_test_moduleInstall_editions_modout() {
                                var x   = 0,
                                    len = keys.length;
                                console.log("Installed submodule versions");
                                console.log("----------------------------");
                                for (x = 0; x < len; x += 1) {
                                    modules[keys[x]].edition(modules[keys[x]]);
                                }
                                next();
                            },
                            submod         = function biddle_test_moduleInstall_editions_submod(output) {
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
                            each           = function biddle_test_moduleInstall_editions_each(val, idx) {
                                appName = val;
                                ind     = idx + 1;
                                submod(false);
                            },
                            update         = function biddle_test_moduleInstall_editions_update() {
                                node
                                    .child("git submodule update", function biddle_test_moduleInstall_editions_update_child(erd, stdoutd, stdouterd) {
                                        if (erd !== null) {
                                            apps.errout({error: erd, name: "biddle_test_moduleInstall_editions_update_child", stdout: stdoutd, time: humantime(true)});
                                        }
                                        if (stdouterd !== null && stdouterd !== "" && stdouterd.indexOf("Cloning into '") < 0 && stdouterd.indexOf("From ") !== 0) {
                                            apps.errout({error: stdouterd, name: "biddle_test_moduleInstall_editions_update_child", stdout: stdoutd, time: humantime(true)});
                                        }
                                        if (flag.today === false) {
                                            console.log("Submodules downloaded.");
                                        }
                                        keys.forEach(each);
                                    });
                            },
                            pull           = function biddle_test_moduleInstall_editions_pull() {
                                node
                                    .child("git submodule foreach git pull origin master", function biddle_test_moduleInstall_editions_pull_child(errpull, stdoutpull, stdouterpull) {
                                        if (errpull !== null) {
                                            console.log(errpull);
                                            if (errpull.toString().indexOf("fatal: no submodule mapping found in .gitmodules for path ") > 0) {
                                                console.log("No access to GitHub or .gitmodules is corrupt. Proceeding assuming submodules we" +
                                                        "re previously installed.");
                                                flag.apps = true;
                                                return keys.forEach(each);
                                            }
                                            apps.errout({error: errpull, name: "biddle_test_moduleInstall_editions_pull_child", stdout: stdoutpull, time: humantime(true)});
                                        }
                                        if (stdouterpull !== null && stdouterpull !== "" && stdouterpull.indexOf("Cloning into '") < 0 && stdouterpull.indexOf("From ") < 0 && stdouterpull.indexOf("fatal: no submodule mapping found in .gitmodules for path ") < 0) {
                                            apps.errout({error: stdouterpull, name: "biddle_test_moduleInstall_editions_pull_child", stdout: stdoutpull, time: humantime(true)});
                                        }
                                        if (flag.today === false) {
                                            console.log("Submodules checked for updates.");
                                        }
                                        keys.forEach(each);
                                    });
                            };
                        if (ind === keys.length) {
                            if (today !== date) {
                                node.child("git checkout jslint.js", {
                                    cwd: data.abspath + "JSLint"
                                }, function biddle_test_moduleInstall_editions_checkoutJSLint(erjsl, stdoutjsl, stdouterjsl) {
                                    if (erjsl !== null) {
                                        apps.errout({error: erjsl, name: "biddle_test_moduleInstall_editions_checkoutJSLint", stdout: stdoutjsl, time: humantime(true)});
                                    }
                                    if (stdouterjsl !== null && stdouterjsl !== "") {
                                        apps.errout({error: stdouterjsl, name: "biddle_test_moduleInstall_editions_checkoutJSLint", stdout: stdoutjsl, time: humantime(true)});
                                    }
                                    ind = 0;
                                    node
                                        .fs
                                        .writeFile("today.js", "/\u002aglobal module\u002a/(function () {\"use strict\";var today=" + date + ";module.exports=today;}());", function biddle_test_moduleInstall_editions_checkoutJSLint_writeToday(werr) {
                                            if (werr !== null && werr !== undefined) {
                                                apps.errout({error: werr, name: "biddle_test_moduleInstall_editions_checkoutJSLint_writeToday", time: humantime(true)});
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
                                            .child("git submodule init", function biddle_test_moduleInstall_editions_checkoutJSLint_init(erc, stdoutc, stdouterc) {
                                                if (erc !== null) {
                                                    apps.errout({error: erc, name: "biddle_test_moduleInstall_editions_checkoutJSLint_init", stdout: stdoutc, time: humantime(true)});
                                                }
                                                if (stdouterc !== null && stdouterc !== "" && stdouterc.indexOf("Cloning into '") < 0 && stdouterc.indexOf("From ") < 0 && stdouterc.indexOf(" registered for path ") < 0) {
                                                    apps.errout({error: stdouterc, name: "biddle_test_moduleInstall_editions_checkoutJSLint_init", stdout: stdoutc, time: humantime(true)});
                                                }
                                                update();
                                            });
                                    } else {
                                        pull();
                                    }
                                 });
                            } else {
                                flag.today = true;
                                console.log("Running prior installed modules.");
                                keys.forEach(each);
                            }
                        } else {
                            handler(ind);
                        }
                    };
                    apps.rmrecurse(testpath, function biddle_test_moduleInstall_rmrecurse() {
                        apps
                            .makedir(testpath, function biddle_test_moduleInstall_rmrecurse_makedir() {
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
                                        "\u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.\nFile publications/biddletesta/" +
                                        "latest.txt written at \u001b[1m\u001b[32mxxx\u001b[39m\u001b[0m bytes.",
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
                                    console.log(humantime(false) + " \u001b[32mThe stdout for publish is correct.\u001b[39m");
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
                                            if (jsondata.biddletesta.latest !== "99.99.1234") {
                                                return apps.errout({
                                                    error : "biddletesta.latest of published.json is '" + jsondata.biddletesta.latest + "' not '99.99.1234'.",
                                                    name  : "biddle_test_publish_child_statTemp_readJSON",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(humantime(false) + " \u001b[32mFile published.json contains biddletesta\u001b[39m");
                                            node
                                                .fs
                                                .readdir(pub, function biddle_test_publish_child_statTemp_readJSON_readdir(errr, files) {
                                                    var filetest = "biddletesta_v.hash,biddletesta_v.zip,biddletesta_latest.hash,biddletesta_latest." +
                                                                "zip,biddletesta_min_v.hash,biddletesta_min_v.zip,biddletesta_min_latest.hash,bid" +
                                                                "dletesta_min_latest.zip,biddletesta_prod_v.hash,biddletesta_prod_v.zip,biddletes" +
                                                                "ta_prod_latest.hash,biddletesta_prod_latest.zip,latest.txt",
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
                                                    console.log(humantime(false) + " \u001b[32mList of files generated by publish is correct.\u001b[39m");
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
                remove       : function biddle_test_remove() {
                    node
                        .child(childcmd + "remove " + testpath + node.path.sep + "biddletesta.js childtest", function biddle_test_remove_child(er, stdout, stder) {
                            var removefile = testpath + node.path.sep + "biddletesta.js",
                                removetest = "Removed " + removefile;
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_remove_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_remove_child", stdout: stdout, time: humantime(true)});
                            }
                            stdout = stdout.replace(/(\s+)$/, "");
                            if (stdout !== removetest) {
                                return diffFiles("biddle_test_remove_child", stdout, removetest);
                            }
                            node
                                .fs
                                .stat(removefile, function biddle_test_remove_child_stat(ers) {
                                    if (ers === null || ers.toString().indexOf("no such file for directory") > 0) {
                                        return apps.errout({error: "remove test failed as file is still present", name: "biddle_test_remove_child_stat", stdout: stdout, time: humantime(true)});
                                    }
                                    console.log(humantime(false) + " \u001b[32mremove test passed.\u001b[39m");
                                    next();
                                });
                        });
                },
                uninstall    : function biddle_test_uninstall() {
                    node
                        .child(childcmd + "uninstall biddletesta childtest", function biddle_test_uninstall_child(er, stdout, stder) {
                            var uninsttest = "App \u001b[36mbiddletesta\u001b[39m is uninstalled.";
                            if (er !== null) {
                                return apps.errout({error: er, name: "biddle_test_uninstall_child", stdout: stdout, time: humantime(true)});
                            }
                            if (stder !== null && stder !== "") {
                                return apps.errout({error: stder, name: "biddle_test_uninstall_child", stdout: stdout, time: humantime(true)});
                            }
                            stdout = stdout.replace(/(\s+)$/, "");
                            if (stdout !== uninsttest) {
                                return diffFiles("biddle_test_uninstall_child", stdout, uninsttest);
                            }
                            if (data.installed.biddletesta !== undefined) {
                                return apps.errout({error: "biddletesta property not removed from data.installed object", name: "biddle_test_uninstall_child", stdout: stdout, time: humantime(true)});
                            }
                            console.log(humantime(false) + " \u001b[32mbiddletesta removed from installed.json.\u001b[39m");
                            node
                                .fs
                                .stat(data.abspath + "applications" + node.path.sep + "biddletesta", function biddle_test_uninstall_child_stat(err, stat) {
                                    if (err !== null && err.toString().indexOf("no such file or directory") < 0) {
                                        return apps.errout({error: err, name: "biddle_test_uninstall_child_stat", time: humantime(true)});
                                    }
                                    if (stat !== undefined && stat.isDirectory() === true) {
                                        return apps.errout({
                                            error : "applications" + node.path.sep + "biddletesta directory not deleted by uninstall command",
                                            name  : "biddle_test_uninstall_child_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
                                    if (err.toString().indexOf("no such file or directory") > 0) {
                                        node
                                            .fs
                                            .readFile(data.abspath + "installed.json", function biddle_test_uninstall_child_stat_readfile(erf, filedata) {
                                                var jsondata = {};
                                                if (erf !== null && erf !== undefined) {
                                                    return apps.errout({error: erf, name: "biddle_test_uninstall_child_stat_readfile", stdout: stdout, time: humantime(true)});
                                                }
                                                jsondata = JSON.parse(filedata);
                                                if (jsondata.biddletesta !== undefined) {
                                                    return apps.errout({error: "biddletesta property still present in installed.json file", name: "biddle_test_uninstall_child_stat_readfile", stdout: stdout, time: humantime(true)});
                                                }
                                                console.log(humantime(false) + " \u001b[32muninstall test passed.\u001b[39m");
                                                node.child(childcmd + "uninstall biddletesta childtest", function biddle_test_uninstall_child_stat_readfile_again(erx, stdoutx, stderx) {
                                                    var uninstagain = "Attempted to uninstall \u001b[36mbiddletesta\u001b[39m which is \u001b[1m\u001b[" +
                                                                    "31mabsent\u001b[39m\u001b[0m from the list of installed applications. Try using " +
                                                                    "the command \u001b[32mbiddle list installed\u001b[39m.",
                                                        stack       = [];
                                                    if (erx !== null) {
                                                        if (typeof erx.stack === "string") {
                                                            stack = erx
                                                                .stack
                                                                .split(" at ");
                                                        }
                                                        if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:202:12)") < 0) {
                                                            return apps.errout({error: erx, name: "biddle_test_uninstall_child_stat_readfile_again", stdout: stdout, time: humantime(true)});
                                                        }
                                                    }
                                                    if (stderx !== null && stderx !== "") {
                                                        return apps.errout({error: stderx, name: "biddle_test_uninstall_child_stat_readfile_again", stdout: stdout, time: humantime(true)});
                                                    }
                                                    stdoutx = stdoutx.replace(/(\s+)$/, "");
                                                    if (stdoutx !== uninstagain) {
                                                        return diffFiles("biddle_test_uninstall_child_stat_readfile_again", stdoutx, uninstagain);
                                                    }
                                                    console.log(humantime(false) + " \u001b[32mRedundant uninstall test (error messaging) passed.\u001b[39m");
                                                    next();
                                                });
                                            });
                                    } else {
                                        return apps.errout({
                                            error : "directory applications" + node.path.sep + "biddletesta changed to something else and not deleted",
                                            name  : "biddle_test_uninstall_child_stat",
                                            stdout: stdout,
                                            time  : humantime(true)
                                        });
                                    }
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
                            console.log(humantime(false) + " \u001b[32mbiddletesta removed from published.json.\u001b[39m");
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
    apps.uninstall   = function biddle_uninstall(fromTest) {
        var app = data.installed[data.input[2]];
        if (app === undefined && fromTest === false) {
            return console.log("Attempted to uninstall \u001b[36m" + data.input[2] + "\u001b[39m which is \u001b[1m\u001b[31mabsent\u001b[39m\u001b[0m from the list o" +
                    "f installed applications. Try using the command \u001b[32mbiddle list installed" +
                    "\u001b[39m.");
        }
        if (fromTest === true) {
            delete data.installed.biddletestb;
            apps.rmrecurse(data.abspath + "applications" + node.path.sep + "biddletestb", function biddle_uninstall_removeTest() {
                return true;
            });
        }
        apps
            .rmrecurse(app.location, function biddle_uninstall_rmrecurse() {
                var str = "";
                delete data.installed[data.input[2]];
                str = JSON.stringify(data.installed);
                apps.writeFile(str, data.abspath + "installed.json", function biddle_uninstall_rmrecurse_writeFile() {
                    if (fromTest === false) {
                        console.log("App \u001b[36m" + data.input[2] + "\u001b[39m is uninstalled.");
                    }
                });
            });
    };
    apps.unpublish   = function biddle_unpublish(fromTest) {
        var app = data.published[data.input[2]];
        if (app === undefined && fromTest === false) {
            return console.log("Attempted to unpublish \u001b[36m" + data.input[2] + "\u001b[39m which is \u001b[1m\u001b[31mabsent\u001b[39m\u001b[0m from the list o" +
                    "f published applications. Try using the command \u001b[32mbiddle list published" +
                    "\u001b[39m.");
        }
        if (fromTest === true) {
            delete data.published.biddletestb;
            apps.rmrecurse(data.abspath + "publications" + node.path.sep + "biddletestb", function biddle_unpublish_removeTest() {
                return true;
            });
        }
        apps
            .rmrecurse(app.directory, function biddle_unpublish_rmrecurse() {
                var str = "";
                delete data.published[data.input[2]];
                str = JSON.stringify(data.published);
                apps.writeFile(str, data.abspath + "published.json", function biddle_unpublish_rmrecurse_writeFile() {
                    if (fromTest === false) {
                        console.log("App \u001b[36m" + data.input[2] + "\u001b[39m is unpublished.");
                    }
                });
            });
    };
    apps.writeFile   = function biddle_writeFile(fileData, fileName, callback) {
        var callbacker = function biddle_writeFile_callbacker(size) {
            var colored = [];
            if (size > 0 && fileName.replace(data.abspath, "") !== "published.json" && fileName.replace(data.abspath, "") !== "installed.json") {
                colored                     = fileName.split(node.path.sep);
                colored[colored.length - 1] = colored[colored.length - 1].replace("_", "_\u001b[1m\u001b[36m");
                if (fileName.indexOf("latest.txt") > 0) {
                    console.log("File " + colored.join(node.path.sep) + " written at \u001b[1m\u001b[32m" + apps.commas(size) + "\u001b[39m\u001b[0m bytes.");
                } else {
                    console.log("File " + colored.join(node.path.sep) + "\u001b[39m\u001b[0m written at \u001b[1m\u001b[32m" + apps.commas(size) + "\u001b[39m\u001b[0m bytes.");
                }
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
            zipdir      = "",
            variantName = (zippack.name === "")
                ? ""
                : "_" + apps.sanitizef(zippack.name),
            childfunc   = function biddle_zip_childfunc(zipfilename, zipcmd, writejson) {
                node
                    .child(zipcmd, {
                        cwd: zipdir
                    }, function biddle_zip_childfunc_child(err, stdout, stderr) {
                        if (err !== null && stderr.toString().indexOf("No such file or directory") < 0) {
                            return apps.errout({error: err, name: "biddle_zip_childfunc_child"});
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "" && stderr.indexOf("No such file or directory") < 0) {
                            return apps.errout({error: stderr, name: "biddle_zip_childfunc_child"});
                        }
                        if (data.command === "install") {
                            node
                                .fs
                                .readFile(data.address.target + "package.json", function biddle_zip_childfunc_child_install(erf, filedata) {
                                    if (erf !== null && erf !== undefined) {
                                        return apps.errout({error: erf, name: "biddle_zip_childfunc_child_install"});
                                    }
                                    data.packjson = JSON.parse(filedata);
                                    callback(zipfilename, writejson);
                                });
                        } else {
                            callback(zipfilename, writejson);
                        }
                        return stdout;
                    });
            };
        if (data.command === "publish" || data.command === "zip") {
            if (data.command === "zip") {
                zipfile = data.address.target + data.fileName + ".zip";
            } else {
                zipfile = data.address.target + apps.sanitizef(data.packjson.name.toLowerCase()) + variantName + "_" + apps.sanitizef(data.packjson.version) + ".zip";
            }
            cmd = cmds.zip(apps.relToAbs(zipfile, false));
            if (data.command === "publish") {
                zipdir = zippack.location;
                if (data.latestVersion === true) {
                    latestfile = zipfile.replace(data.packjson.version + ".zip", "latest.zip");
                    latestcmd  = cmd.replace(data.packjson.version + ".zip", "latest.zip");
                    childfunc(latestfile, latestcmd, false);
                }
                childfunc(zipfile, cmd, true);
            } else {
                apps
                    .makedir(data.input[2], function biddle_zip_makedir() {
                        zipdir = data.input[2];
                        childfunc(zipfile, cmd, false);
                    });
            }
        }
        if (data.command === "install" || data.command === "unzip") {
            cmd = cmds.unzip();
            apps.makedir(data.address.target, function biddle_zip_unzip() {
                childfunc(data.input[2], cmd, false);
            });
        }
    };
    (function biddle_init() {
        var status    = {
                installed: false,
                published: false
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
                } else if (commands[data.command] === undefined) {
                    apps.errout({
                        error: "Unrecognized command: \u001b[31m" + data.command + "\u001b[39m.  Currently these commands are recognized:\r\n\r\n" + Object
                            .keys(commands)
                            .join("\r\n") + "\r\n",
                        name : "biddle_init_start"
                    });
                } else {
                    if (data.input[2] === undefined && data.command !== "commands" && data.command !== "global" && data.command !== "list" && data.command !== "status" && data.command !== "test") {
                        if (data.command === "copy" || data.command === "hash" || data.command === "markdown" || data.command === "remove" || data.command === "unzip" || data.command === "zip") {
                            valuetype = "path to a local file or directory";
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
                    if (data.input[3] === undefined && data.command === "copy") {
                        return apps.errout({
                            error: "Command \u001b[32m" + data.command + "\u001b[39m requires a destination directory.",
                            name : "biddle_init_start"
                        });
                    }
                    if (data.command === "commands") {
                        apps.commands();
                    } else if (data.command === "copy") {
                        apps.copy();
                    } else if (data.command === "get") {
                        apps
                            .get(data.input[2], function biddle_init_start_getback(filedata) {
                                apps
                                    .writeFile(filedata, data.address.target + data.fileName, function biddle_init_start_getback_callback() {
                                        return filedata;
                                    });
                            });
                    } else if (data.command === "global") {
                        apps.makeGlobal();
                    } else if (data.command === "hash") {
                        apps
                            .hashCmd(data.input[2], "hashFile", function biddle_init_start_hash() {
                                console.log(data.hashFile);
                            });
                    } else if (data.command === "install") {
                        apps.install();
                    } else if (data.command === "list") {
                        apps.list();
                    } else if (data.command === "markdown") {
                        apps.help();
                    } else if (data.command === "publish") {
                        apps.publish();
                    } else if (data.command === "remove") {
                        apps
                            .rmrecurse(data.input[2], function biddle_init_stat_remove() {
                                console.log("Removed " + apps.relToAbs(data.input[2]));
                            });
                    } else if (data.command === "status") {
                        apps.status();
                    } else if (data.command === "test") {
                        apps.test();
                    } else if (data.command === "uninstall") {
                        apps.uninstall(false);
                    } else if (data.command === "unpublish") {
                        apps.unpublish(false);
                    } else if (data.command === "unzip") {
                        apps
                            .zip(function biddle_init_start_unzip(zipfile) {
                                return console.log("File " + zipfile + " unzipped to: " + data.address.target);
                            }, {
                                location: apps.relToAbs(data.input[2]),
                                name    : ""
                            });
                    } else if (data.command === "zip") {
                        apps
                            .zip(function biddle_init_start_zip(zipfile) {
                                return console.log("Zip file written: " + zipfile);
                            }, {
                                location: apps.relToAbs(data.input[2]),
                                name    : ""
                            });
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
                },
                dirs = [],
                app  = "";
            if (typeof data.input[3] === "string") {
                addy.target = data
                    .input[3]
                    .replace(/((\\|\/)+)$/, "") + node.path.sep;
            } else if (data.command === "publish") {
                addy.target = data.abspath + "publications" + node.path.sep;
            } else if (data.command === "install") {
                dirs        = data
                    .input[2]
                    .split(node.path.sep);
                app         = dirs[dirs.length - 1];
                addy.target = data.abspath + "applications" + node.path.sep + apps.sanitizef(app.slice(0, app.indexOf("_"))) + node.path.sep;
            } else {
                addy.target = addy.downloads;
            }
            return addy;
        }());
        data.fileName = apps.getFileName();
        data.platform = process
            .platform
            .replace(/\s+/g, "")
            .toLowerCase();
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
