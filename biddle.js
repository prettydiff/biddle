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
            copy     : true, // Copy files or directory trees from location to another on the local file system.
            get      : true, // Get something via http/https.
            global   : true, // Make biddle a global command in the terminal.
            hash     : true, // Generate a hash sequence against a file.
            help     : true, // Output the readme.md to the terminal.
            install  : true, // Install a published application.
            list     : true, // List installed and/or published applications.
            markdown : true, // Parse any markdown and output to terminal.
            publish  : true, // Publish an application/version.
            remove   : true, // Remove a file or directory from the local file system.
            status   : true, // Determine if version on installed applications are behind the latest published version.
            test     : true, // Test automation.
            uninstall: true, // Uninstall an application installed by biddle.
            unpublish: true, // Unpublish an application published by biddle.
            unzip    : true, // Unzip a zip file.
            zip      : true // Zip a file or directory.
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
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"[Environment]::GetEnvironmentVariab" +
                        "le('PATH','Machine');\"";
                }
                return "/etc/paths";
            },
            pathRemove: function biddle_cmds_pathRemove(cmdFile) { // Used in command global to remove the biddle path from the Windows path list
                return "powershell.exe -nologo -noprofile -command \"$PATH='" + cmdFile + "';[Environment]::SetEnvironmentVariable('PATH',$PATH,'Machine');\"";
            },
            pathSet   : function biddle_cmds_pathSet() { // Used in command global to add the biddle path to the Windows path list
                return "powershell.exe -nologo -noprofile -command \"$PATH=[Environment]::GetEnvironment" +
                           "Variable('PATH');[Environment]::SetEnvironmentVariable('PATH',$PATH';" + data.abspath + "cmd','Machine');\"";
            },
            remove    : function biddle_cmds_remove(dir) { // Recursively and forcefully removes a directory tree or file from the file system
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"rm " + dir + " -r -force\"";
                }
                return "rm -rf " + dir;
            },
            unzip     : function biddle_cmds_unzip () { // Unzips a zip archive into a collection
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
        node.child(cmds.copy(data.input[3]), function biddle_copy_child(er, stdout, stder) {
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
            process.chdir(data.cwd);
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
                                        ? data.input[2]
                                        : apps.relToAbs(data.input[2]);
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
                            b += 1;
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
                    a            = 0;
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
                            apps.writeFile(cmds.cmdFile(), data.abspath + "cmd\\biddle.cmd", function biddle_makeGlobal_winRead_winWritePath_winMakeDir_winWriteCmd() {
                                console.log(data.abspath + "cmd\\biddle.cmd written. Please restart your terminal.");
                            });
                        });
                        return stdoutw;
                    });
            });
        }
        node
            .fs
            .readFile(cmds.pathRead(), "utf8", function biddle_makeGlobal_nixRead(err, filedata) {
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
            if (data.input[3] !== undefined && data.published[data.packjson.name] !== undefined) {
                data.published[data.packjson.name].directory = data.address.target + apps.sanitizef(data.packjson.name);
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
        var list = [],
            versions = {},
            a    = 0,
            b    = 0,
            len  = 0,
            single = false,
            name = function biddle_status_name(pub, name) {
                var dirs = [];
                if ((/^(https?:\/\/)/i).test(pub) === true) {
                    dirs = pub.split("/");
                    dirs.pop();
                    if (name === true) {
                        return dirs.pop();
                    }
                    return dirs.join("/") + "/latest.txt";
                }
                dirs = pub.split(node.path.sep);
                dirs.pop();
                if (name === true) {
                    return dirs.pop();
                }
                return dirs.join(node.path.sep) + node.path.sep + "latest.txt";
            },
            compare = function biddle_status_compare() {
                var keys = Object.keys(versions),
                    klen = keys.length,
                    k    = 0,
                    currents = [],
                    outs = [];
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
            getversion =  function biddle_status_get(filedata, filepath) {
                versions[name(filepath, true)] = filedata;
                b += 1;
                if (b === len) {
                    compare();
                }
            };
        if (data.input[2] !== undefined) {
            if (data.installed[data.input[2]] !== undefined) {
                list = [data.input[2]];
                single = true;
            } else {
                return apps.errout({error: data.input[2] + " is not a biddle installed application.", name: "biddle_status"});
            }
        } else {
            list = Object.keys(data.installed);
            if (list.length < 1) {
                return apps.errout({error: "No applications installed by biddle.", name: "biddle_status"});
            }
        }
        len = list.length;
        do {
            apps.get(name(data.installed[list[a]].published, false), getversion);
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
                "help",
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
                    ? "node biddle "
                    : "biddle "
                : (data.abspath === process.cwd() + node.path.sep)
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
                copy         : function biddle_test_copy() {
                    node.child(childcmd + "copy " + data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "biddletesta.js " + testpath + " childtest", function biddle_test_copy_child(er, stdout, stder) {
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
                        node.fs.stat(copyfile, function biddle_test_copy_child_stat(ers, stats) {
                            if (ers !== null) {
                                return apps.errout({error: ers, name: "biddle_test_copy_child_stat", stdout: stdout, time: humantime(true)});
                            }
                            if (stats === undefined || stats.isFile() === false) {
                                return apps.errout({error: "copy failed as " + copyfile + " is not present", name: "biddle_test_copy_child_stat", stdout: stdout, time: humantime(true)});
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
                        var helptest = "\n\u001b[4m\u001b[1m\u001b[31mbiddle\u001b[39m\u001b[0m\u001b[24m\n\u001b[3m\u001b[33mA package management application without a package\nmanagement service.\u001b[39m\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mLicense\u001b[39m\u001b[0m\u001b[24m\n  MIT, (\u001b[36mhttps://opensource.org/licenses/MIT\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mVersion\u001b[39m\u001b[0m\u001b[24m\n  0.1.0\n\n\u001b[4m\u001b[1m\u001b[36mAbout\u001b[39m\u001b[0m\u001b[24m\n  This application is a cross-OS solution to creating zip\n  files for distribution and fetching files via HTTP(S).\n  The project's goal is to provide a universal application\n  distribution utility that is language agnostic, operating\n  system independent, and platform independent.  The only\n  additional requirement for distributing application\n  packages is online storage on a web server.  This\n  application provides all the utilities to retrieve,\n  bundle, and unpackage applications.\n\n  biddle is inspired by the incredible awesomeness of\n  NPM, (\u001b[36mhttp://npmjs.com\u001b[39m), but seeks to accomplish a few\n  additional goals:\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mintegrity\u001b[39m\u001b[0m - Downloaded packages will perform a\n    hash comparison before they are unpackaged.  If the\n    hashes don't match the zip file will be saved in the\n    downloads directory awaiting a human touch.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mautonomy\u001b[39m\u001b[0m - There is no central authority here.\n    Host your own publications and manage them as you please\n    with any name you choose.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mmanagement\u001b[39m\u001b[0m - There is no dependency hell here.\n    Dependency management will not be automated, but a means\n    to manage and review the status of all\n    installed/published packages is provided.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mfreedom\u001b[39m\u001b[0m - biddle will work everywhere Node.js\n    runs.  It can be used with any application written in\n    any language whether binary or text.\n\n\u001b[4m\u001b[1m\u001b[36mProject Status\u001b[39m\u001b[0m\u001b[24m\n\n  Project is in \u001b[1mbeta\u001b[0m status.  This project is stable and\n  ready for examination, but not ready for production or\n  commercial use.\n\n  \u001b[4m\u001b[1m\u001b[32mTodo list\u001b[39m\u001b[0m\u001b[24m\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m need to work out \u001b[3m\u001b[33mglobal\u001b[39m\u001b[0m switch for \u001b[1minstall\u001b[0m\n      command\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m there is a minor bug in the \u001b[3m\u001b[33mlint\u001b[39m\u001b[0m phase of the\n      \u001b[1mtest\u001b[0m command where the program occasionally exits early\n\n\n\u001b[4m\u001b[1m\u001b[36mSupported commands\u001b[39m\u001b[0m\u001b[24m\n  Commands are the third command line argument, or second\n  if the \u001b[3m\u001b[33mnode\u001b[39m\u001b[0m argument is absent.  Commands are case\n  insensitive, but values and local paths are case\n  sensitive.  All local address are either absolute from the\n  root or relative from the current working directory.\n\n  \u001b[4m\u001b[1m\u001b[32mcopy\u001b[39m\u001b[0m\u001b[24m\n    Copy files or directories to a different directory.\n\n\u001b[32m    node biddle copy myFile myOtherDirectory\u001b[39m\n\u001b[32m    node biddle copy myDirectory myOtherDirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mget\u001b[39m\u001b[0m\u001b[24m\n    Merely downloads the requested resource and saves\n    it as a file with the same filename. If the filename is\n    not provided in the URI the final directory up to the\n    domain name will become the filename, and if for some\n    reason that doesn't work the default filename is\n    \u001b[3m\u001b[33mdownload.xxx\u001b[39m\u001b[0m.\n\n    Download a file to the default location, which is\n    the provided \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle get http://google.com\u001b[39m\n\n    Download a file to an alternate location.\n\n\u001b[32m    node biddle get http://google.com ../mydirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mglobal\u001b[39m\u001b[0m\u001b[24m\n    The global command adds biddle's path to the OS\n    path variable so that biddle can be run from any\n    location without explicitly calling Node.js, example: \u001b[32mbiddle help\n    instead of \u001b[32mnode biddle help.\u001b[39m Use the \u001b[32mremove \u001b[39moption to\n    remove biddle from the path. This command requires use\n    of sudo in non-Windows environments or an administrative\n    console in Windows.\n\n    Allowing global availability to biddle in\n    non-Windows environments.\n\n\u001b[32m    sudo node biddle global\u001b[39m\n\n    Removing global availability to biddle in\n    non-Windows environments.\n\n\u001b[32m    sudo biddle global remove\u001b[39m\n\n    Allowing global availability to biddle in Windows.\n    This command requires an administrative console.\n\n\u001b[32m    node biddle global\u001b[39m\n\n    Removing global availability to biddle in Windows\n    environments. This command requires an administrative\n    console.\n\n\u001b[32m    biddle global remove\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhash\u001b[39m\u001b[0m\u001b[24m\n    Prints to console a SHA512 hash against a local\n    file.\n\n\u001b[32m    node biddle hash downloads/myfile.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhelp\u001b[39m\u001b[0m\u001b[24m\n    Prints the readme.md file contents to console in a\n    human friendly way.\n\n    No command will still generate the readme data.\n\n\u001b[32m    node biddle\u001b[39m\n\n    The default word wrapping is set to 100 characters.\n\n\u001b[32m    node biddle help\u001b[39m\n\n    Set a custom word wrap limit.\n\n\u001b[32m    node biddle help 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32minstall\u001b[39m\u001b[0m\u001b[24m\n    Downloads the requested zip file, but performs a\n    hash comparison before unzipping the file.\n\n\u001b[32m    node biddle install http://example.com/downloads/application_latest.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mlist\u001b[39m\u001b[0m\u001b[24m\n    Will list all installed and/or published\n    applications with their locations and latest versions.\n    It can take the optional argument \u001b[3m\u001b[33minstalled\u001b[39m\u001b[0m or \u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m\n    to output a specific list or both lists are produced.\n\n    Only output the installed list.\n\n\u001b[32m    node biddle list installed\u001b[39m\n\n    Only output the published list.\n\n\u001b[32m    node biddle list published\u001b[39m\n\n    Output both lists\n\n\u001b[32m    node biddle list\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mmarkdown\u001b[39m\u001b[0m\u001b[24m\n    Allows the internal markdown parser used by the\n    \u001b[1mhelp\u001b[0m command to be supplied to a directed file to ease\n    reading of documentation directly from the command line.\n\n    The first argument after the command is the address\n    of the file to read.\n\n\u001b[32m    node biddle markdown applications/example/readme.md\u001b[39m\n\n    You can also specify a custom word wrap limit.  The\n    default is 100.\n\n\u001b[32m    node biddle markdown applications/example/readme.md 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mpublish\u001b[39m\u001b[0m\u001b[24m\n    Writes a hash file and a zip file with a version\n    number to the publications directory or some other\n    specified location.  Applications are required to have a\n    file in their root directory named \u001b[3m\u001b[33mpackage.json\u001b[39m\u001b[0m with\n    properties: \u001b[3m\u001b[33mname\u001b[39m\u001b[0m and \u001b[3m\u001b[33mversion\u001b[39m\u001b[0m.\n\n    Create a zip in the default location:\n    ./publications/myApplicationDirectory\n\n\u001b[32m    node biddle publish ../myApplicationDirectory\u001b[39m\n\n    Publish to a custom location:\n    ./myAlternateDirectory/myApplicationDirectory\n\n\u001b[32m    node biddle publish ../myApplicationDirectory myAlternateDirectory\u001b[39m\n\n    Use quotes if any argument contains spaces:\n\n\u001b[32m    node biddle publish \"c:\\program files\\myApplicationDirectory\"\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mstatus\u001b[39m\u001b[0m\u001b[24m\n    Will check whether an installed application is\n    behind the latest published version.\n\n    Check the status of all installed applications\n\n\u001b[32m    node biddle status\u001b[39m\n\n    Check the status of an application by name\n\n\u001b[32m    noe biddle status myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mtest\u001b[39m\u001b[0m\u001b[24m\n    Run the user acceptance tests.\n\n\u001b[32m    node biddle test\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32muninstall\u001b[39m\u001b[0m\u001b[24m\n    Will delete an installed application by name and\n    remove the application from the installed list.\n\n\u001b[32m    node biddle uninstall myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32munpublish\u001b[39m\u001b[0m\u001b[24m\n    Will delete a published application by name and\n    remove the application from the published list.\n\n\u001b[32m    node biddle unpublish myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32munzip\u001b[39m\u001b[0m\u001b[24m\n    Unzips a local zipped file.\n\n    Unzip to the default location, the supplied\n    \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle unzip myZipFile.zip\u001b[39m\n\n    Unzip to a specified location.\n\n\u001b[32m    node biddle unzip myZipFile.zip myDirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mzip\u001b[39m\u001b[0m\u001b[24m\n    Zips local files or local directories into a zip\n    file.\n\n    Zip to the defau",
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
                        var helptest = "\n\u001b[4m\u001b[1m\u001b[31mbiddle\u001b[39m\u001b[0m\u001b[24m\n\u001b[3m\u001b[33mA package management application without a package management service.\u001b[39m\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mLicense\u001b[39m\u001b[0m\u001b[24m\n  MIT, (\u001b[36mhttps://opensource.org/licenses/MIT\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mVersion\u001b[39m\u001b[0m\u001b[24m\n  0.1.0\n\n\u001b[4m\u001b[1m\u001b[36mAbout\u001b[39m\u001b[0m\u001b[24m\n  This application is a cross-OS solution to creating zip files for\n  distribution and fetching files via HTTP(S).  The project's goal is to provide\n  a universal application distribution utility that is language agnostic,\n  operating system independent, and platform independent.  The only additional\n  requirement for distributing application packages is online storage on a web\n  server.  This application provides all the utilities to retrieve, bundle, and\n  unpackage applications.\n\n  biddle is inspired by the incredible awesomeness of NPM,\n  (\u001b[36mhttp://npmjs.com\u001b[39m), but seeks to accomplish a few additional goals:\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mintegrity\u001b[39m\u001b[0m - Downloaded packages will perform a hash comparison before\n    they are unpackaged.  If the hashes don't match the zip file will be saved\n    in the downloads directory awaiting a human touch.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mautonomy\u001b[39m\u001b[0m - There is no central authority here.  Host your own\n    publications and manage them as you please with any name you choose.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mmanagement\u001b[39m\u001b[0m - There is no dependency hell here.  Dependency management\n    will not be automated, but a means to manage and review the status of all\n    installed/published packages is provided.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mfreedom\u001b[39m\u001b[0m - biddle will work everywhere Node.js runs.  It can be used\n    with any application written in any language whether binary or text.\n\n\u001b[4m\u001b[1m\u001b[36mProject Status\u001b[39m\u001b[0m\u001b[24m\n\n  Project is in \u001b[1mbeta\u001b[0m status.  This project is stable and ready for\n  examination, but not ready for production or commercial use.\n\n  \u001b[4m\u001b[1m\u001b[32mTodo list\u001b[39m\u001b[0m\u001b[24m\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m need to work out \u001b[3m\u001b[33mglobal\u001b[39m\u001b[0m switch for \u001b[1minstall\u001b[0m command\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m there is a minor bug in the \u001b[3m\u001b[33mlint\u001b[39m\u001b[0m phase of the \u001b[1mtest\u001b[0m command where\n      the program occasionally exits early\n\n\n\u001b[4m\u001b[1m\u001b[36mSupported commands\u001b[39m\u001b[0m\u001b[24m\n  Commands are the third command line argument, or second if the \u001b[3m\u001b[33mnode\u001b[39m\u001b[0m\n  argument is absent.  Commands are case insensitive, but values and local paths\n  are case sensitive.  All local address are either absolute from the root or\n  relative from the current working directory.\n\n  \u001b[4m\u001b[1m\u001b[32mcopy\u001b[39m\u001b[0m\u001b[24m\n    Copy files or directories to a different directory.\n\n\u001b[32m    node biddle copy myFile myOtherDirectory\u001b[39m\n\u001b[32m    node biddle copy myDirectory myOtherDirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mget\u001b[39m\u001b[0m\u001b[24m\n    Merely downloads the requested resource and saves it as a file with the\n    same filename. If the filename is not provided in the URI the final\n    directory up to the domain name will become the filename, and if for some\n    reason that doesn't work the default filename is \u001b[3m\u001b[33mdownload.xxx\u001b[39m\u001b[0m.\n\n    Download a file to the default location, which is the provided\n    \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle get http://google.com\u001b[39m\n\n    Download a file to an alternate location.\n\n\u001b[32m    node biddle get http://google.com ../mydirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mglobal\u001b[39m\u001b[0m\u001b[24m\n    The global command adds biddle's path to the OS path variable so that\n    biddle can be run from any location without explicitly calling Node.js,\n    example: \u001b[32mbiddle help \u001b[39minstead of \u001b[32mnode biddle help.\u001b[39m Use the \u001b[32mremove \u001b[39moption to\n    remove biddle from the path. This command requires use of sudo in\n    non-Windows environments or an administrative console in Windows.\n\n    Allowing global availability to biddle in non-Windows environments.\n\n\u001b[32m    sudo node biddle global\u001b[39m\n\n    Removing global availability to biddle in non-Windows environments.\n\n\u001b[32m    sudo biddle global remove\u001b[39m\n\n    Allowing global availability to biddle in Windows. This command\n    requires an administrative console.\n\n\u001b[32m    node biddle global\u001b[39m\n\n    Removing global availability to biddle in Windows environments. This\n    command requires an administrative console.\n\n\u001b[32m    biddle global remove\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhash\u001b[39m\u001b[0m\u001b[24m\n    Prints to console a SHA512 hash against a local file.\n\n\u001b[32m    node biddle hash downloads/myfile.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhelp\u001b[39m\u001b[0m\u001b[24m\n    Prints the readme.md file contents to console in a human friendly way.\n\n    No command will still generate the readme data.\n\n\u001b[32m    node biddle\u001b[39m\n\n    The default word wrapping is set to 100 characters.\n\n\u001b[32m    node biddle help\u001b[39m\n\n    Set a custom word wrap limit.\n\n\u001b[32m    node biddle help 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32minstall\u001b[39m\u001b[0m\u001b[24m\n    Downloads the requested zip file, but performs a hash comparison before\n    unzipping the file.\n\n\u001b[32m    node biddle install http://example.com/downloads/application_latest.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mlist\u001b[39m\u001b[0m\u001b[24m\n    Will list all installed and/or published applications with their\n    locations and latest versions.  It can take the optional argument \u001b[3m\u001b[33minstalled\u001b[39m\u001b[0m\n    or \u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m to output a specific list or both lists are produced.\n\n    Only output the installed list.\n\n\u001b[32m    node biddle list installed\u001b[39m\n\n    Only output the published list.\n\n\u001b[32m    node biddle list published\u001b[39m\n\n    Output both lists\n\n\u001b[32m    node biddle list\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mmarkdown\u001b[39m\u001b[0m\u001b[24m\n    Allows the internal markdown parser used by the \u001b[1mhelp\u001b[0m command to be\n    supplied to a directed file to ease reading of documentation directly from\n    the command line.\n\n    The first argument after the command is the address of the file to read.\n\n\u001b[32m    node biddle markdown applications/example/readme.md\u001b[39m\n\n    You can also specify a custom word wrap limit.  The default is 100.\n\n\u001b[32m    node biddle markdown applications/example/readme.md 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mpublish\u001b[39m\u001b[0m\u001b[24m\n    Writes a hash file and a zip file with a version number to the\n    publications directory or some other specified location.  Applications are\n    required to have a file in their root directory named \u001b[3m\u001b[33mpackage.json\u001b[39m\u001b[0m with\n    properties: \u001b[3m\u001b[33mname\u001b[39m\u001b[0m and \u001b[3m\u001b[33mversion\u001b[39m\u001b[0m.\n\n    Create a zip in the default location:\n    ./publications/myApplicationDirectory\n\n\u001b[32m    node biddle publish ../myApplicationDirectory\u001b[39m\n\n    Publish to a custom location:\n    ./myAlternateDirectory/myApplicationDirectory\n\n\u001b[32m    node biddle publish ../myApplicationDirectory myAlternateDirectory\u001b[39m\n\n    Use quotes if any argument contains spaces:\n\n\u001b[32m    node biddle publish \"c:\\program files\\myApplicationDirectory\"\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mstatus\u001b[39m\u001b[0m\u001b[24m\n    Will check whether an installed application is behind the latest\n    published version.\n\n    Check the status of all installed applications\n\n\u001b[32m    node biddle status\u001b[39m\n\n    Check the status of an application by name\n\n\u001b[32m    noe biddle status myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mtest\u001b[39m\u001b[0m\u001b[24m\n    Run the user acceptance tests.\n\n\u001b[32m    node biddle test\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32muninstall\u001b[39m\u001b[0m\u001b[24m\n    Will delete an installed application by name and remove the application\n    from the installed list.\n\n\u001b[32m    node biddle uninstall myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32munpublish\u001b[39m\u001b[0m\u001b[24m\n    Will delete a published application by name and remove the application\n    from the published list.\n\n\u001b[32m    node biddle unpublish myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32munzip\u001b[39m\u001b[0m\u001b[24m\n    Unzips a local zipped file.\n\n    Unzip to the default location, the supplied \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle unzip myZipFile.zip\u001b[39m\n\n    Unzip to a specified location.\n\n\u001b[32m    node biddle unzip myZipFile.zip myDirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mzip\u001b[39m\u001b[0m\u001b[24m\n    Zips local files or local directories into a zip file.\n\n    Zip to the default location, the supplied \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node bid",
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
                        var helptest = "\n\u001b[4m\u001b[1m\u001b[31mbiddle\u001b[39m\u001b[0m\u001b[24m\n\u001b[3m\u001b[33mA package management application without a package management service.\u001b[39m\u001b[0m\n\n\u001b[4m\u001b[1m\u001b[36mLicense\u001b[39m\u001b[0m\u001b[24m\n  MIT, (\u001b[36mhttps://opensource.org/licenses/MIT\u001b[39m)\n\n\u001b[4m\u001b[1m\u001b[36mVersion\u001b[39m\u001b[0m\u001b[24m\n  0.1.0\n\n\u001b[4m\u001b[1m\u001b[36mAbout\u001b[39m\u001b[0m\u001b[24m\n  This application is a cross-OS solution to creating zip files for distribution and fetching files via HTTP(S).  The\n  project's goal is to provide a universal application distribution utility that is language agnostic, operating system\n  independent, and platform independent.  The only additional requirement for distributing application packages is\n  online storage on a web server.  This application provides all the utilities to retrieve, bundle, and unpackage\n  applications.\n\n  biddle is inspired by the incredible awesomeness of NPM, (\u001b[36mhttp://npmjs.com\u001b[39m), but seeks to accomplish a few\n  additional goals:\n\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mintegrity\u001b[39m\u001b[0m - Downloaded packages will perform a hash comparison before they are unpackaged.  If the hashes\n    don't match the zip file will be saved in the downloads directory awaiting a human touch.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mautonomy\u001b[39m\u001b[0m - There is no central authority here.  Host your own publications and manage them as you please with\n    any name you choose.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mmanagement\u001b[39m\u001b[0m - There is no dependency hell here.  Dependency management will not be automated, but a means to\n    manage and review the status of all installed/published packages is provided.\n  \u001b[1m\u001b[31m*\u001b[39m\u001b[0m \u001b[3m\u001b[33mfreedom\u001b[39m\u001b[0m - biddle will work everywhere Node.js runs.  It can be used with any application written in any\n    language whether binary or text.\n\n\u001b[4m\u001b[1m\u001b[36mProject Status\u001b[39m\u001b[0m\u001b[24m\n\n  Project is in \u001b[1mbeta\u001b[0m status.  This project is stable and ready for examination, but not ready for production or\n  commercial use.\n\n  \u001b[4m\u001b[1m\u001b[32mTodo list\u001b[39m\u001b[0m\u001b[24m\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m need to work out \u001b[3m\u001b[33mglobal\u001b[39m\u001b[0m switch for \u001b[1minstall\u001b[0m command\n    \u001b[1m\u001b[31m*\u001b[39m\u001b[0m there is a minor bug in the \u001b[3m\u001b[33mlint\u001b[39m\u001b[0m phase of the \u001b[1mtest\u001b[0m command where the program occasionally exits early\n\n\n\u001b[4m\u001b[1m\u001b[36mSupported commands\u001b[39m\u001b[0m\u001b[24m\n  Commands are the third command line argument, or second if the \u001b[3m\u001b[33mnode\u001b[39m\u001b[0m argument is absent.  Commands are case\n  insensitive, but values and local paths are case sensitive.  All local address are either absolute from the root or\n  relative from the current working directory.\n\n  \u001b[4m\u001b[1m\u001b[32mcopy\u001b[39m\u001b[0m\u001b[24m\n    Copy files or directories to a different directory.\n\n\u001b[32m    node biddle copy myFile myOtherDirectory\u001b[39m\n\u001b[32m    node biddle copy myDirectory myOtherDirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mget\u001b[39m\u001b[0m\u001b[24m\n    Merely downloads the requested resource and saves it as a file with the same filename. If the filename is not\n    provided in the URI the final directory up to the domain name will become the filename, and if for some reason that\n    doesn't work the default filename is \u001b[3m\u001b[33mdownload.xxx\u001b[39m\u001b[0m.\n\n    Download a file to the default location, which is the provided \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle get http://google.com\u001b[39m\n\n    Download a file to an alternate location.\n\n\u001b[32m    node biddle get http://google.com ../mydirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mglobal\u001b[39m\u001b[0m\u001b[24m\n    The global command adds biddle's path to the OS path variable so that biddle can be run from any location\n    without explicitly calling Node.js, example: \u001b[32mbiddle help \u001b[39minstead of \u001b[32mnode biddle help.\u001b[39m Use the \u001b[32mremove \u001b[39moption to\n    remove biddle from the path. This command requires use of sudo in non-Windows environments or an administrative\n    console in Windows.\n\n    Allowing global availability to biddle in non-Windows environments.\n\n\u001b[32m    sudo node biddle global\u001b[39m\n\n    Removing global availability to biddle in non-Windows environments.\n\n\u001b[32m    sudo biddle global remove\u001b[39m\n\n    Allowing global availability to biddle in Windows. This command requires an administrative console.\n\n\u001b[32m    node biddle global\u001b[39m\n\n    Removing global availability to biddle in Windows environments. This command requires an administrative console.\n\n\u001b[32m    biddle global remove\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhash\u001b[39m\u001b[0m\u001b[24m\n    Prints to console a SHA512 hash against a local file.\n\n\u001b[32m    node biddle hash downloads/myfile.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mhelp\u001b[39m\u001b[0m\u001b[24m\n    Prints the readme.md file contents to console in a human friendly way.\n\n    No command will still generate the readme data.\n\n\u001b[32m    node biddle\u001b[39m\n\n    The default word wrapping is set to 100 characters.\n\n\u001b[32m    node biddle help\u001b[39m\n\n    Set a custom word wrap limit.\n\n\u001b[32m    node biddle help 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32minstall\u001b[39m\u001b[0m\u001b[24m\n    Downloads the requested zip file, but performs a hash comparison before unzipping the file.\n\n\u001b[32m    node biddle install http://example.com/downloads/application_latest.zip\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mlist\u001b[39m\u001b[0m\u001b[24m\n    Will list all installed and/or published applications with their locations and latest versions.  It can take\n    the optional argument \u001b[3m\u001b[33minstalled\u001b[39m\u001b[0m or \u001b[3m\u001b[33mpublished\u001b[39m\u001b[0m to output a specific list or both lists are produced.\n\n    Only output the installed list.\n\n\u001b[32m    node biddle list installed\u001b[39m\n\n    Only output the published list.\n\n\u001b[32m    node biddle list published\u001b[39m\n\n    Output both lists\n\n\u001b[32m    node biddle list\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mmarkdown\u001b[39m\u001b[0m\u001b[24m\n    Allows the internal markdown parser used by the \u001b[1mhelp\u001b[0m command to be supplied to a directed file to ease reading\n    of documentation directly from the command line.\n\n    The first argument after the command is the address of the file to read.\n\n\u001b[32m    node biddle markdown applications/example/readme.md\u001b[39m\n\n    You can also specify a custom word wrap limit.  The default is 100.\n\n\u001b[32m    node biddle markdown applications/example/readme.md 80\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mpublish\u001b[39m\u001b[0m\u001b[24m\n    Writes a hash file and a zip file with a version number to the publications directory or some other specified\n    location.  Applications are required to have a file in their root directory named \u001b[3m\u001b[33mpackage.json\u001b[39m\u001b[0m with properties: \u001b[3m\u001b[33mname\u001b[39m\u001b[0m\n    and \u001b[3m\u001b[33mversion\u001b[39m\u001b[0m.\n\n    Create a zip in the default location: ./publications/myApplicationDirectory\n\n\u001b[32m    node biddle publish ../myApplicationDirectory\u001b[39m\n\n    Publish to a custom location: ./myAlternateDirectory/myApplicationDirectory\n\n\u001b[32m    node biddle publish ../myApplicationDirectory myAlternateDirectory\u001b[39m\n\n    Use quotes if any argument contains spaces:\n\n\u001b[32m    node biddle publish \"c:\\program files\\myApplicationDirectory\"\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mstatus\u001b[39m\u001b[0m\u001b[24m\n    Will check whether an installed application is behind the latest published version.\n\n    Check the status of all installed applications\n\n\u001b[32m    node biddle status\u001b[39m\n\n    Check the status of an application by name\n\n\u001b[32m    noe biddle status myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mtest\u001b[39m\u001b[0m\u001b[24m\n    Run the user acceptance tests.\n\n\u001b[32m    node biddle test\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32muninstall\u001b[39m\u001b[0m\u001b[24m\n    Will delete an installed application by name and remove the application from the installed list.\n\n\u001b[32m    node biddle uninstall myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32munpublish\u001b[39m\u001b[0m\u001b[24m\n    Will delete a published application by name and remove the application from the published list.\n\n\u001b[32m    node biddle unpublish myApplicationName\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32munzip\u001b[39m\u001b[0m\u001b[24m\n    Unzips a local zipped file.\n\n    Unzip to the default location, the supplied \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle unzip myZipFile.zip\u001b[39m\n\n    Unzip to a specified location.\n\n\u001b[32m    node biddle unzip myZipFile.zip myDirectory\u001b[39m\n\n  \u001b[4m\u001b[1m\u001b[32mzip\u001b[39m\u001b[0m\u001b[24m\n    Zips local files or local directories into a zip file.\n\n    Zip to the default location, the supplied \u001b[3m\u001b[33mdownloads\u001b[39m\u001b[0m directory.\n\n\u001b[32m    node biddle zip ../myApplication\u001b[39m\n\n    Zip to a specified location.\n\n\u001b[32m    no",
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
                    var listcmds = [
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
                        changed = false,
                        listChild = function biddle_test_listStatus_childWrapper() {
                            node.child(childcmd + listcmds[0] + " childtest", function biddle_test_listStatus_childWrapper_child(er, stdout, stder) {
                                var listout = "\u001b[4mInstalled applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m - 99.99.1234 - " + data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "applications" + node.path.sep + "biddletestb" + node.path.sep + "\n\n\u001b[4mPublished applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m - 99.99.1234 - " + data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "publications" + node.path.sep + "biddletestb" + node.path.sep,
                                    listpub = "\u001b[4mPublished applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m - 99.99.1234 - " + data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "publications" + node.path.sep + "biddletestb" + node.path.sep,
                                    listist = "\u001b[4mInstalled applications:\u001b[0m\n\n* \u001b[36mbiddletesta\u001b[39m - 99.99.1234 - " + data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep + "\n* \u001b[36mbiddletestb\u001b[39m - 98.98.1234 - " + data.abspath + "applications" + node.path.sep + "biddletestb" + node.path.sep,
                                    statout = "\n\u001b[4m\u001b[32mAll Applications Are Current:\u001b[39m\u001b[0m\n\n* biddletesta matches published version \u001b[36m99.99.1234\u001b[39m\n* biddletestb matches published version \u001b[36m98.98.1234\u001b[39m",
                                    statpba = "\n* biddletesta matches published version \u001b[36m99.99.1234\u001b[39m",
                                    statpbb = "\n\u001b[4mOutdated Applications:\u001b[0m\n\n* biddletesta is installed at version \u001b[1m\u001b[31m99.99.1234\u001b[39m\u001b[0m but published version is \u001b[36m11.22.6789\u001b[39m\n\n\u001b[4mCurrent Applications:\u001b[0m\n\n* biddletestb matches published version \u001b[36m98.98.1234\u001b[39m",
                                    statpbc = "\n* biddletesta is installed at version \u001b[1m\u001b[31m99.99.1234\u001b[39m\u001b[0m but published version is \u001b[36m11.22.6789\u001b[39m";
                                if (er !== null) {
                                    return apps.errout({error: er, name: "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout: stdout, time: humantime(true)});
                                }
                                if (stder !== null && stder !== "") {
                                    return apps.errout({error: stder, name: "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " + listcmds[0] + ")", stdout: stdout, time: humantime(true)});
                                }
                                stdout = stdout.replace(/(\s+)$/, "").replace(/\r\n/g, "\n");
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
                            },
                            pull   = function biddle_test_moduleInstall_editions_pull() {
                                node
                                    .child("git submodule foreach git pull origin master", function biddle_test_moduleInstall_editions_pull_child(errpull, stdoutpull, stdouterpull) {
                                        if (errpull !== null) {
                                            console.log(errpull);
                                            if (errpull.toString().indexOf("fatal: no submodule mapping found in .gitmodules for path ") > 0) {
                                                console.log("No access to GitHub or .gitmodules is corrupt. Proceeding assuming submodules were previously installed.");
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
                                        return stdoutpull;
                                    });
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
                                    if (appName === "jslint") {
                                        process.chdir(data.abspath + "JSLint");
                                        node.child("git checkout jslint.js", function biddle_test_moduleInstall_editions_lintCheckout(erjsl, stdoutjsl, stdouterjsl) {
                                            if (erjsl !== null) {
                                                apps.errout({error: erjsl, name: "biddle_test_moduleInstall_editions_lintCheckout", stdout: stdoutjsl, time: humantime(true)});
                                            }
                                            if (stdouterjsl !== null && stdouterjsl !== "" && stdouterjsl.indexOf("Cloning into '") < 0 && stdouterjsl.indexOf("From ") !== 0) {
                                                apps.errout({error: stdouterjsl, name: "biddle_test_moduleInstall_editions_lintCheckout", stdout: stdoutjsl, time: humantime(true)});
                                            }
                                            process.chdir(data.cwd);
                                            pull();
                                        });
                                    } else {
                                        pull();
                                    }
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
                    node.child(childcmd + "remove " + testpath + node.path.sep + "biddletesta.js childtest", function biddle_test_remove_child(er, stdout, stder) {
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
                        node.fs.stat(removefile, function biddle_test_remove_child_stat(ers) {
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
    apps.uninstall   = function biddle_uninstall(fromTest) {
        var app = data.installed[data.input[2]];
        if (app === undefined && fromTest === false) {
            return console.log("Attempted to uninstall \u001b[36m" + data.input[2] + "\u001b[39m which is \u001b[1m\u001b[31mabsent\u001b[39m\u001b[0m from the list o" +
                    "f installed applications. Try using the command \u001b[32mbiddle list installed" +
                    "\u001b[39m.");
        }
        if (fromTest === true) {
            delete data.installed.biddletestb;
            apps
                .rmrecurse(data.abspath + "applications" + node.path.sep + "biddletestb", function biddle_uninstall_removeTest() {
                    return true;
                });
        }
        apps
            .rmrecurse(app.location, function biddle_uninstall_rmrecurse() {
                delete data.installed[data.input[2]];
                apps.writeFile(JSON.stringify(data.installed), data.abspath + "installed.json", function biddle_uninstall_rmrecurse_writeFile() {
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
            apps
                .rmrecurse(data.abspath + "publications" + node.path.sep + "biddletestb", function biddle_unpublish_removeTest() {
                    return true;
                });
        }
        apps
            .rmrecurse(app.directory, function biddle_unpublish_rmrecurse() {
                delete data.published[data.input[2]];
                apps.writeFile(JSON.stringify(data.published), data.abspath + "published.json", function biddle_unpublish_rmrecurse_writeFile() {
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
            variantName = (zippack.name === "")
                ? ""
                : "_" + apps.sanitizef(zippack.name),
            childfunc   = function biddle_zip_childfunc(zipfilename, zipcmd, writejson) {
                node
                    .child(zipcmd, function biddle_zip_childfunc_child(err, stdout, stderr) {
                        if (err !== null && stderr.toString().indexOf("No such file or directory") < 0) {
                            return apps.errout({error: err, name: "biddle_zip_childfunc_child"});
                        }
                        if (stderr !== null && stderr.replace(/\s+/, "") !== "" && stderr.indexOf("No such file or directory") < 0) {
                            return apps.errout({error: stderr, name: "biddle_zip_childfunc_child"});
                        }
                        if (data.command === "zip" || data.command === "publish") {
                            process.chdir(data.cwd);
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
                process.chdir(zippack.location);
                if (data.latestVersion === true) {
                    latestfile = zipfile.replace(data.packjson.version + ".zip", "latest.zip");
                    latestcmd  = cmd.replace(data.packjson.version + ".zip", "latest.zip");
                    childfunc(latestfile, latestcmd, false);
                }
                childfunc(zipfile, cmd, true);
            } else {
                apps
                    .makedir(data.input[2], function biddle_zip_makedir() {
                        process.chdir(data.input[2]);
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
                    if (data.input[2] === undefined && data.command !== "status" && data.command !== "list" && data.command !== "test" && data.command !== "global") {
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
                    if (data.command === "copy") {
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
                        apps.rmrecurse(data.input[2], function biddle_init_stat_remove() {
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
                addy.target = addy.downloads
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
