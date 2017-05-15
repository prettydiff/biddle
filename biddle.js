/*jshint laxbreak: true*/
/*jslint node: true, for: true*/
(function biddle() {
    "use strict";
    var node     = {
            child : require("child_process").exec,
            crypto: require("crypto"),
            fs    : require("fs"),
            http  : require("http"),
            https : require("https"),
            path  : require("path")
        },
        text     = {
            blue     : "\u001b[34m",
            bold     : "\u001b[1m",
            cyan     : "\u001b[36m",
            green    : "\u001b[32m",
            nocolor  : "\u001b[39m",
            none     : "\u001b[39m\u001b[0m",
            normal   : "\u001b[0m",
            purple   : "\u001b[35m",
            red      : "\u001b[31m",
            underline: "\u001b[4m",
            yellow   : "\u001b[33m"
        },
        commands = { // The list of supported biddle commands.
            commands : "List the supported commands to the console.",
            copy     : "Copy files or directory trees from one location to another on the local file s" +
                    "ystem.",
            get      : "Get something via http/https.",
            global   : "Make an installed application into a global command in the terminal.",
            hash     : "Generate a hash sequence against a file.",
            help     : "Parse biddle's readme.md to the terminal.",
            install  : "Install a published application.",
            list     : "List installed and/or published applications.",
            markdown : "Parse any markdown and output to terminal.",
            publish  : "Publish an application/version.",
            remove   : "Remove a file or directory from the local file system.",
            status   : "Determine if version on installed applications are behind the latest published" +
                    " version.",
            test     : "Test automation.",
            uninstall: "Uninstall an application installed by biddle.",
            unpublish: "Unpublish an application, or a version, published by biddle.",
            unzip    : "Unzip a zip file.",
            update   : "Issues a status command and automatically installs the latest version if the i" +
                    "nstalled version is outdated.",
            version  : "Output an installed application's version number.",
            zip      : "Zip a file or directory."
        },
        data     = {
            abspath      : "", // Local absolute path to biddle.
            address      : {
                applications: "", // Local absolute path where applications will be installed to.
                downloads   : "", // Local absolute path to biddle download directory.
                publications: "", // Local absolute path where applications will be published to.
                target      : "" // Location where files will be written to.
            },
            applications : "applications", // default place to store installed applications
            childtest    : false, // If the current biddle instance is a child of another biddle instance (occurs due to test automation)
            command      : "", // Executed biddle command.
            cwd          : process.cwd(), // Current working directory before running biddle.
            filename     : "", // Stores an inferred file name when files need to be written and a package.json is not used, such as the get command.
            hashFile     : "", // Stores hash value from reading a downloaded hash file.  Used for hash comparison with the install command.
            hashZip      : "", // Stores locally computed hash value for a downloaded zip file.  Used for hash comparison with the install command.
            ignore       : [], // List of relative locations to ignore from the .biddlerc file's exclusions object.
            input        : [], // Normalized process.argv list.
            installed    : {}, // Parsed data of the installed.json file.  Data about applications installed with biddle.
            internal     : false, // Used for biddle's internal enhancements
            latestVersion: false, // Used in the publish command to determine if the application is the latest version
            packjson     : {}, // Parsed data of a directory's package.json file.  Used with the publish command.
            parallel     : false, // Whether variants should be published in parallel (faster but not stable) or in sequence.  Set from .biddlerc
            platform     : "", // Lowercase of Node's process.platform
            protocoltest : (/^(((ht)|f)tps?:\/\/)/i), // To determine if input requires use of HTTP get
            publications : "publications", // default location to store published applications
            published    : {}, // Parsed data of the published.json file.  Data about applications published by biddle.
            sudo         : false // If biddle is executed with administrative rights in POSIX.
        },
        cmds     = { // The OS specific commands executed outside Node.js
            pathRead  : function biddle_cmds_pathRead() { // Used in command global to read the OS's stored paths
                return "powershell.exe -nologo -noprofile -command \"[Environment]::GetEnvironmentVari" +
                        "able('PATH','Machine');\"";
            },
            pathRemove: function biddle_cmds_pathRemove(cmdFile) { // Used in command global to remove the biddle path from the Windows path list
                return "powershell.exe -nologo -noprofile -command \"$PATH='" + cmdFile + "';[E" +
                        "nvironment]::SetEnvironmentVariable('PATH',$PATH,'Machine');\"";
            },
            pathSet   : function biddle_cmds_pathSet(appspath) { // Used in command global to add the biddle path to the Windows path list
                return "powershell.exe -nologo -noprofile -command \"$PATH=[Environment]::GetEnvironme" +
                        "ntVariable('PATH');[Environment]::SetEnvironmentVariable('PATH',$PATH + ';" +
                        appspath + "cmd','Machine');\"";
            },
            unzip     : function biddle_cmds_unzip(filename, outputDirectory) { // Unzips a zip archive into a collection
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compre" +
                            "ssion.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('" +
                            filename + "', '" + outputDirectory + "'); }\"";
                }
                return "unzip -oq " + filename + " -d " + outputDirectory;
            },
            zip       : function biddle_cmds_zip(filename, file) { // Stores all items of the given directory into a zip archive directly without creating a new directory. Locations resolved by a symlink are stored, but the actual symlink is not stored.
                if (data.platform === "win32") {
                    return "powershell.exe -nologo -noprofile -command \"& { Add-Type -A 'System.IO.Compre" +
                            "ssion.FileSystem'; [IO.Compression.ZipFile]::CreateFromDirectory('.', '" +
                            filename + "'); }\"";
                }
                if (file === "") {
                    return "zip -r9yq " + filename + " ." + node.path.sep + " *.[!.]";
                }
                return "zip -r9yq " + filename + " " + file;
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
        console.log(text.underline + "biddle Commands" + text.normal);
        console.log("");
        do {
            if (keys[a].length > lens) {
                lens = keys[a].length;
            }
            a = a + 1;
        } while (a < len);
        a = 0;
        do {
            comm = keys[a];
            b    = comm.length;
            if (b < lens) {
                do {
                    comm = comm + " ";
                    b    = b + 1;
                } while (b < lens);
            }
            console.log(text.cyan + comm + text.nocolor + ": " + commands[keys[a]]);
            a = a + 1;
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
            a      = a - 3;
            arr[a] = "," + arr[a];
        } while (a > 3);
        return arr.join("");
    };
    apps.copy        = function biddle_copy(target, destination, exclusions, callback) {
        var numb  = {
                dirs : 0,
                files: 0,
                link : 0,
                size : 0
            },
            start = "",
            dest  = "",
            exlen = exclusions.length,
            dirs  = {},
            util  = {};
        util.complete = function biddle_copy_complete(item) {
            var out = ["biddle copied "];
            delete dirs[item];
            if (Object.keys(dirs).length < 1) {
                if (data.command === "copy") {
                    out.push(text.green);
                    out.push(text.bold);
                    out.push(numb.dirs);
                    out.push(text.none);
                    out.push(" director");
                    if (numb.dirs === 1) {
                        out.push("y, ");
                    } else {
                        out.push("ies, ");
                    }
                    out.push(text.green);
                    out.push(text.bold);
                    out.push(numb.files);
                    out.push(text.none);
                    out.push(" file");
                    if (numb.files !== 1) {
                        out.push("s");
                    }
                    out.push(", and ");
                    out.push(text.green);
                    out.push(text.bold);
                    out.push(numb.link);
                    out.push(text.none);
                    out.push(" symbolic link");
                    if (numb.link !== 1) {
                        out.push("s");
                    }
                    out.push(" at ");
                    out.push(text.green);
                    out.push(text.bold);
                    out.push(apps.commas(numb.size));
                    out.push(text.none);
                    out.push(" bytes.");
                    console.log(out.join(""));
                    console.log(
                        "Copied " + text.cyan + target + text.nocolor + " to " + text.green +
                        destination + text.nocolor
                    );
                }
                callback();
            }
        };
        util.eout     = function biddle_copy_eout(er, name) {
            var filename = target.split(node.path.sep);
            apps.remove(
                destination + node.path.sep + filename[filename.length - 1],
                function biddle_copy_eout_remove() {
                    apps.errout({error: er, name: name});
                }
            );
        };
        util.dir      = function biddle_copy_dir(item) {
            node
                .fs
                .readdir(item, function biddle_copy_dir_makedir_readdir(er, files) {
                    var place = (data.command === "publish")
                        ? (item === start)
                            ? dest
                            : dest + item.replace(start + node.path.sep, "")
                        : dest + item.replace(data.cwd.toLowerCase() + node.path.sep, "");
                    if (er !== null) {
                        return util.eout(er, "biddle_copy_dir_readdir");
                    }
                    apps.makedir(place, function biddle_copy_dir_makedir() {
                        var a = files.length,
                            b = 0;
                        if (a > 0) {
                            delete dirs[item];
                            do {
                                dirs[item + node.path.sep + files[b]] = true;
                                b                                     = b + 1;
                            } while (b < a);
                            b = 0;
                            do {
                                util.stat(item + node.path.sep + files[b], item);
                                b = b + 1;
                            } while (b < a);
                        } else {
                            util.complete(item);
                        }
                    });
                });
        };
        util.file     = function biddle_copy_file(item, dir, prop) {
            var place       = (data.command === "publish")
                    ? dest + item.replace(start + node.path.sep, "")
                    : dest + item.replace(data.cwd.toLowerCase() + node.path.sep, ""),
                readStream  = node
                    .fs
                    .createReadStream(item),
                writeStream = {},
                errorflag   = false;
            if (item === dir) {
                place = dest + item
                    .split(node.path.sep)
                    .pop();
            }
            writeStream = node
                .fs
                .createWriteStream(place, {mode: prop.mode});
            readStream.on("error", function biddle_copy_file_readError(error) {
                errorflag = true;
                return util.eout(error, "biddle_copy_file_readError");
            });
            writeStream.on("error", function biddle_copy_file_writeError(error) {
                errorflag = true;
                return util.eout(error, "biddle_copy_file_writeError");
            });
            if (errorflag === true) {
                return;
            }
            writeStream.on("open", function biddle_copy_file_write() {
                readStream.pipe(writeStream);
            });
            writeStream.once("finish", function biddle_copy_file_finish() {
                var filename = item.split(node.path.sep);
                node
                    .fs
                    .utimes(
                        dest + node.path.sep + filename[filename.length - 1],
                        prop.atime,
                        prop.mtime,
                        function biddle_copy_file_finish_utimes() {
                            util.complete(item);
                        }
                    );
            });
        };
        util.link     = function biddle_copy_link(item, dir) {
            node
                .fs
                .readlink(item, function biddle_copy_link_readlink(err, resolvedlink) {
                    if (err !== null) {
                        return util.eout(err, "biddle_copy_link_readlink");
                    }
                    resolvedlink = apps.relToAbs(resolvedlink, data.cwd);
                    node
                        .fs
                        .stat(resolvedlink, function biddle_copy_link_readlink_stat(ers, stats) {
                            var type  = "file",
                                place = dest + item;
                            if (ers !== null) {
                                return util.eout(ers, "biddle_copy_link_readlink_stat");
                            }
                            if (stats === undefined || stats.isFile === undefined) {
                                return util.eout(
                                    "Error in performing stat against " + item,
                                    "biddle_copy_link_readlink_stat"
                                );
                            }
                            if (item === dir) {
                                place = dest + item
                                    .split(node.path.sep)
                                    .pop();
                            }
                            if (stats.isDirectory() === true) {
                                type = "junction";
                            }
                            node
                                .fs
                                .symlink(
                                    resolvedlink,
                                    place,
                                    type,
                                    function biddle_copy_link_readlink_stat_makelink(erl) {
                                        if (erl !== null) {
                                            return util.eout(erl, "biddle_copy_link_readlink_stat_makelink");
                                        }
                                        util.complete(item);
                                    }
                                );
                        });
                });
        };
        util.stat     = function biddle_copy_stat(item, dir) {
            var a    = 0,
                func = (data.command === "copy")
                    ? "lstat"
                    : "stat";
            if (exlen > 0) {
                do {
                    if (item.replace(start + node.path.sep, "") === exclusions[a]) {
                        exclusions.splice(a, 1);
                        exlen = exlen - 1;
                        util.complete(item);
                        return;
                    }
                    a = a + 1;
                } while (a < exlen);
            }
            node.fs[func](item, function biddle_copy_stat_callback(er, stats) {
                if (er !== null) {
                    return util.eout(er, "biddle_copy_stat_callback");
                }
                if (stats === undefined || stats.isFile === undefined) {
                    return util.eout("stats object is undefined", "biddle_copy_stat_callback");
                }
                if (stats.isFile() === true) {
                    numb.files = numb.files + 1;
                    numb.size  = numb.size + stats.size;
                    if (item === dir) {
                        apps.makedir(dest, function biddle_copy_stat_callback_file() {
                            util.file(item, dir, {
                                atime: (Date.parse(stats.atime) / 1000),
                                mode : stats.mode,
                                mtime: (Date.parse(stats.mtime) / 1000)
                            });
                        });
                    } else {
                        util.file(item, dir, {
                            atime: (Date.parse(stats.atime) / 1000),
                            mode : stats.mode,
                            mtime: (Date.parse(stats.mtime) / 1000)
                        });
                    }
                } else if (stats.isDirectory() === true) {
                    numb.dirs = numb.dirs + 1;
                    util.dir(item);
                } else if (stats.isSymbolicLink() === true) {
                    numb.link = numb.link + 1;
                    if (item === dir) {
                        apps.makedir(dest, function biddle_copy_stat_callback_symb() {
                            util.link(item, dir);
                        });
                    } else {
                        util.link(item, dir);
                    }
                } else {
                    util.complete(item);
                }
            });
        };
        target        = target.replace(/(\\|\/)/g, node.path.sep);
        destination   = destination.replace(/(\\|\/)/g, node.path.sep);
        dest          = apps.relToAbs(destination, data.cwd) + node.path.sep;
        start         = apps.relToAbs(target, data.cwd);
        util.stat(start, start);
    };
    apps.errout      = function biddle_errout(errData) {
        var error = (
                typeof errData.error !== "string" || errData.error.toString().indexOf("Error: ") === 0
            )
                ? errData
                    .error
                    .toString()
                    .replace("Error: ", text.bold + text.red + "Error:" + text.none + " ")
                : text.bold + text.red + "Error:" + text.none + " " + errData
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
        if (data.command === "test" && (data.input[2] === "biddle" || data.input[2] === "biddletesta" || data.input[2] === "biddletestb")) {
            apps.remove(data.abspath + "unittest", function biddle_errout_dataClean() {
                apps.remove(
                    data.abspath + "temp",
                    function biddle_errout_dataClean_tempTestClean() {
                        console.log(text.red + "Unit test failure." + text.nocolor);
                        if (errData.stdout !== undefined) {
                            console.log(errData.stdout);
                        }
                        console.log(
                            text.bold + text.cyan + "Function:" + text.none + " " + errData.name
                        );
                        console.log(error);
                        console.log("");
                        console.log(stack);
                        if (errData.time === undefined) {
                            console.log(text.none);
                        } else {
                            console.log("");
                            console.log(errData.time + text.none);
                        }
                        if (errData.name.indexOf("biddle_test") === 0) {
                            data.published.biddletesta = {
                                directory: data.abspath + "publications" + node.path.sep + "biddletesta"
                            };
                            data.installed.biddletesta = {
                                location: data.abspath + "applications" + node.path.sep + "biddletesta"
                            };
                            data.input[2]              = "biddletesta";
                            data.input[3]              = "all";
                            setTimeout(function biddle_errout_delayPrimary() {
                                apps.uninstall(true);
                                apps.unpublish(true);
                                setTimeout(function biddle_errout_delaySecondary() {
                                    process.exit(1);
                                }, 500);
                            }, 1000);
                        }
                    }
                );
            });
        } else {
            apps.remove(
                data.abspath + "temp",
                function biddle_errout_dataClean_tempNontestClean() {
                    console.log(
                        text.bold + text.cyan + "Function:" + text.none + " " + errData.name
                    );
                    console.log(error);
                    if (data.childtest === false) {
                        console.log("");
                        console.log(stack);
                        console.log("");
                        console.log(
                            "Please report defects to https://github.com/prettydiff/biddle/issues" + text.none
                        );
                    }
                    process.exit(1);
                }
            );
        }
    };
    apps.get         = function biddle_get(url, fileName, callback) {
        var a       = (typeof url === "string")
                ? url.indexOf("s://")
                : 0,
            zippy   = ((data.command === "install" || data.command === "update") && (/(\.zip)$/).test(url) === true),
            addy    = (zippy === true)
                ? data.address.downloads
                : data.address.target,
            getcall = function biddle_get_getcall(res) {
                var file = [];
                res.on("data", function biddle_get_getcall_data(chunk) {
                    file.push(chunk);
                });
                res.on("end", function biddle_get_getcall_end() {
                    if (res.statusCode !== 200) {
                        if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location !== undefined) {
                            console.log(
                                res.statusCode + " " + node.http.STATUS_CODES[res.statusCode] +
                                ", for request " + url
                            );
                            url = res.headers.location;
                            biddle_get(url, fileName, callback);
                        } else if (data.command !== "install" && data.command !== "update") {
                            console.log(
                                res.statusCode + " " + text.bold + text.red + node.http.STATUS_CODES[res.statusCode] +
                                text.none + ", for request " + url
                            );
                        } else {
                            return apps.errout({
                                error: data.command + " failed due to " + res.statusCode + " " + text.bold + text.red +
                                        node
                                    .http
                                    .STATUS_CODES[res.statusCode] + text.none + " on request " + url,
                                name : "biddle_get_getcall_end"
                            });
                        }
                    } else if ((data.command !== "install" && data.command !== "update" && (/[\u0002-\u0008]|[\u000e-\u001f]/).test(file[0]) === true) || zippy === true) {
                        apps.makedir(addy, function biddle_get_getcall_end_complete() {
                            apps.writeFile(
                                Buffer.concat(file),
                                addy + fileName,
                                function biddle_get_getcall_end_complete_writeFile(filedata) {
                                    callback(filedata, url);
                                }
                            );
                        });
                    } else {
                        callback(file.join(""), url);
                    }
                });
                res.on("error", function biddle_get_getcall_error(error) {
                    return apps.errout({error: error, name: "biddle_get_getcall_error"});
                });
            };
        if (data.protocoltest.test(url) === false) {
            if ((/(\.zip)$/).test(url) === true) {
                if (data.command !== "update") {
                    console.log(
                        "Address " + url + " is missing the " + text.cyan + "http(s)" + text.nocolor +
                        " scheme, treating as a local path..."
                    );
                }
                apps.makedir(addy, function biddle_get_localZip() {
                    apps.copy(apps.relToAbs(url, data.cwd), data.abspath + "downloads", [], callback);
                });
            } else {
                apps.readBinary(url, function biddle_get_readLocal(filedata) {
                    callback(filedata, url);
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
    apps.getFileName = function biddle_getFileName(filepath) {
        var paths  = [],
            output = "";
        if (filepath === undefined) {
            return "download.xxx";
        }
        if (data.protocoltest.test(filepath) === true) {
            output = filepath.replace(data.protocoltest, "");
            if (output.indexOf("?") > 0) {
                output = output.slice(0, output.indexOf("?"));
            }
            paths = output.split("/");
        } else {
            paths = filepath
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
    apps.getpjson    = function biddle_getpjson(file, callback) {
        node
            .fs
            .readFile(file, "utf8", function biddle_getpjson_readfile(err, fileData) {
                if (err !== null && err !== undefined) {
                    if (err.toString().indexOf("no such file or directory") > 0) {
                        file = file.replace(node.path.sep + "package.json", "");
                        node
                            .fs
                            .stat(file, function biddle_getpjson_readfile_testdir(errs) {
                                if (errs !== null && errs.toString().indexOf("no such file or directory") > -1) {
                                    apps.errout({
                                        error: "Directory " + text.red + text.bold + file + text.none + " does not exist.",
                                        name : "biddle_getpjson_readfile_testdir"
                                    });
                                } else {
                                    apps.errout({
                                        error: "The package.json file is missing from " + data.input[2] + ". biddle cannot pub" +
                                                "lish without a package.json file. Perhaps " + apps.relToAbs(
                                            data.input[2],
                                            data.cwd
                                        ) + " is the incorrect location.",
                                        name : "biddle_getpjson_readFile_testdir"
                                    });
                                }
                            });
                    } else {
                        apps.errout({error: err, name: "biddle_getpjson_readFile"});
                    }
                    return;
                }
                data.packjson = JSON.parse(fileData);
                if (typeof data.packjson.name !== "string" || data.packjson.name.length < 1) {
                    return apps.errout({
                        error: "The package.json file is missing the required " + text.red + "name" + text.nocolor +
                                " property.",
                        name : "biddle_getpjson_readfile"
                    });
                }
                if (typeof data.packjson.version !== "string" || data.packjson.version.length < 1) {
                    return apps.errout({
                        error: "The package.json file is missing the required " + text.red + "version" +
                                text.nocolor + " property.",
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
    apps.global      = function biddle_global(loc) {
        var bin = loc + "bin";
        if (data.input[2] === undefined || data.input[2] === "") {
            data.input[2] = "biddle";
        } else if (data.input[2] === "remove") {
            data.input[2] = "biddle";
            data.input[3] = "remove";
        } else {
            if (data.installed[data.input[2]] === undefined && data.command === "global") {
                return apps.errout({
                    error: "Application " + data.input[2] + " is not installed by biddle. biddle will only" +
                            " add applications to the environmental path that it has installed.",
                    name : "biddle_global"
                });
            }
            bin = loc + "bin";
        }
        if (data.platform === "win32") {
            return node.child(
                cmds.pathRead(),
                function biddle_global_winRead(er, stdout, stder) {
                    var remove = "";
                    if (er !== null) {
                        return apps.errout({error: er, name: "biddle_global_winRead"});
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout({error: stder, name: "biddle_global_winRead"});
                    }
                    if (stdout.indexOf(bin) > -1) {
                        if (data.input[3] === "remove") {
                            remove = stdout
                                .replace(";" + loc + "cmd", "")
                                .replace(/(\s+)$/, "");
                            return node.child(
                                cmds.pathRemove(remove),
                                function biddle_global_winRead_winRemovePath(erw, stdoutw, stderw) {
                                    if (erw !== null) {
                                        return apps.errout({error: erw, name: "biddle_global_winRead_winRemovePath"});
                                    }
                                    if (stderw !== null && stderw !== "") {
                                        return apps.errout(
                                            {error: stderw, name: "biddle_global_winRead_winRemovePath"}
                                        );
                                    }
                                    if (data.command === "global") {
                                        console.log(loc + "cmd removed from %PATH%.");
                                    }
                                    return stdoutw;
                                }
                            );
                        }
                        if (data.command === "global") {
                            return apps.errout({
                                error: loc + "cmd is already in %PATH%",
                                name : "biddle_global_winRead"
                            });
                        }
                    }
                    if (data.input[3] === "remove" && data.command === "global") {
                        return apps.errout({
                            error: loc + "cmd is not present in %PATH%",
                            name : "biddle_global_winRead"
                        });
                    }
                    node.child(
                        cmds.pathSet(loc),
                        function biddle_global_winRead_winWritePath(erw, stdoutw, stderw) {
                            if (erw !== null) {
                                return apps.errout({error: erw, name: "biddle_global_winRead_winWritePath"});
                            }
                            if (stderw !== null && stderw !== "") {
                                return apps.errout({error: stderw, name: "biddle_global_winRead_winWritePath"});
                            }
                            if (data.command === "global") {
                                console.log(loc + "cmd added to %PATH%.");
                            }
                            return stdoutw;
                        }
                    );
                }
            );
        }
        node.child("echo ~", function biddle_global_findHome(erh, stdouth, stderh) {
            var flag     = {
                    bash_profile: false,
                    profile     : false
                },
                terminal = function biddle_global_findHome_terminal() {
                    if (data.input[3] === "remove" && data.command === "global") {
                        return console.log(
                            bin + " removed from $PATH but will remain available until the terminal is rest" +
                            "arted."
                        );
                    }
                    if (data.command === "global") {
                        console.log(
                            "Restart the terminal or execute:  export PATH=" + bin + ":$PATH"
                        );
                    }
                },
                readPath = function biddle_global_findHome_readPath(dotfile) {
                    node
                        .fs
                        .readFile(
                            dotfile,
                            "utf8",
                            function biddle_global_findHome_readPath_nixRead(err, filedata) {
                                var pathStatement = "\nexport PATH=\"" + bin + ":$PATH\"\n";
                                if (err !== null && err !== undefined) {
                                    return apps.errout(
                                        {error: err, name: "biddle_global_findHome_nixStat_nixRead"}
                                    );
                                }
                                if (filedata.indexOf(bin) > -1) {
                                    if (data.input[3] === "remove") {
                                        return apps.writeFile(
                                            filedata.replace(pathStatement, ""),
                                            dotfile,
                                            function biddle_global_findHome_readPath_nixRead_nixRemove() {
                                                if (data.command === "global") {
                                                    console.log("Path updated in " + dotfile);
                                                }
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
                                            }
                                        );
                                    }
                                    if (data.command === "global") {
                                        return apps.errout({
                                            error: bin + " is already in $PATH",
                                            name : "biddle_global_findHome_readPath_nixRead"
                                        });
                                    }
                                }
                                if (data.input[3] === "remove" && data.command !== "uninstall") {
                                    return apps.errout({
                                        error: bin + " is not present in $PATH",
                                        name : "biddle_global_findHome_readPath_nixRead"
                                    });
                                }
                                apps.writeFile(
                                    filedata + pathStatement,
                                    dotfile,
                                    function biddle_global_findHome_readPath_nixRead_nixRemove() {
                                        if (data.command === "global") {
                                            console.log("Path updated in " + dotfile);
                                        }
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
                                    }
                                );
                            }
                        );
                };
            if (erh !== null) {
                return apps.errout({error: erh, name: "biddle_global_findHome"});
            }
            if (stderh !== null && stderh !== "") {
                return apps.errout({error: stderh, name: "biddle_global_findHome"});
            }
            stdouth = stdouth.replace(/\s+/g, "") + "/.";
            node
                .fs
                .stat(
                    stdouth + "profile",
                    function biddle_cmds_global_findHome_nixStatProfile(er) {
                        if (er !== null) {
                            if (er.toString().indexOf("no such file or directory") > 1) {
                                flag.profile = true;
                                if (flag.bash_profile === true) {
                                    terminal();
                                }
                            } else {
                                return apps.errout(
                                    {error: er, name: "biddle_cmds_global_findHome_nixStatProfile"}
                                );
                            }
                        } else {
                            readPath(stdouth + "profile");
                        }
                    }
                );
            node
                .fs
                .stat(
                    stdouth + "bash_profile",
                    function biddle_cmds_global_findHome_nixStatBash(er) {
                        if (er !== null) {
                            if (er.toString().indexOf("no such file or directory") > 1) {
                                flag.bash_profile = true;
                                if (flag.profile === true) {
                                    terminal();
                                }
                            } else {
                                return apps.errout(
                                    {error: er, name: "biddle_cmds_global_findHome_nixStatBash"}
                                );
                            }
                        } else {
                            readPath(stdouth + "bash_profile");
                        }
                    }
                );
        });
    };
    apps.hash        = function biddle_hash(filepath, store, callback) {
        var hash = node
            .crypto
            .createHash("sha512");
        if (filepath === "string" && data.input[3] !== undefined) {
            hash.update(data.input[3]);
            console.log(hash.digest("hex"));
        } else {
            node
                .fs
                .stat(filepath, function biddle_hash_stat(er, stat) {
                    if (er !== null) {
                        if (er.toString().indexOf("no such file or directory") > 0) {
                            if (data.command === "install") {
                                return apps.errout({
                                    error: filepath + " " + text.red + "does not appear to be a zip file" + text.nocolor +
                                            ". Install command expects to receive a zip file and a hash file at the same lo" +
                                            "cation and file name.",
                                    name : "biddle_hash_stat"
                                });
                            }
                            return apps.errout({
                                error: "filepath " + filepath + " is not a file.",
                                name : "biddle_hash_stat"
                            });
                        }
                        return apps.errout({error: er, name: "biddle_hash_stat"});
                    }
                    if (stat === undefined || stat.isFile() === false) {
                        if (data.command === "install") {
                            return apps.errout({
                                error: filepath + " " + text.red + "does not appear to be a zip file" + text.nocolor +
                                        ". Install command expects to receive a zip file and a hash file at the same lo" +
                                        "cation and file name.",
                                name : "biddle_hash_stat"
                            });
                        }
                        return apps.errout({
                            error: "filepath " + filepath + " is not a file.",
                            name : "biddle_hash_stat"
                        });
                    }
                    node
                        .fs
                        .open(filepath, "r", function biddle_hash_stat_open(ero, fd) {
                            var msize = (stat.size < 100)
                                    ? stat.size
                                    : 100,
                                buff  = new Buffer(msize);
                            if (ero !== null) {
                                return apps.errout({error: ero, name: "biddle_hash_stat_open"});
                            }
                            node
                                .fs
                                .read(
                                    fd,
                                    buff,
                                    0,
                                    msize,
                                    1,
                                    function biddle_hash_stat_open_read(erra, bytesa, buffera) {
                                        var bstring  = "",
                                            hashExec = function biddle_hash_stat_open_read_hashExec(filedump) {
                                                hash.on("readable", function biddle_hash_stat_open_read_readBinary_hash() {
                                                    var hashdata = hash.read(),
                                                        hashstr  = "";
                                                    if (hashdata !== null) {
                                                        hashstr     = hashdata
                                                            .toString("hex")
                                                            .replace(/\s+/g, "");
                                                        data[store] = hashstr;
                                                        callback(hashstr);
                                                    }
                                                });
                                                hash.write(filedump);
                                                hash.end();
                                            };
                                        if (erra !== null) {
                                            return apps.errout({error: erra, name: "biddle_hash_stat_open_read"});
                                        }
                                        bstring = buffera.toString("utf8", 0, buffera.length);
                                        bstring = bstring.slice(2, bstring.length - 2);
                                        if ((/[\u0002-\u0008]|[\u000e-\u001f]/).test(bstring) === true) {
                                            buff = new Buffer(stat.size);
                                            node
                                                .fs
                                                .read(
                                                    fd,
                                                    buff,
                                                    0,
                                                    stat.size,
                                                    0,
                                                    function biddle_hash_stat_open_read_readBinary(errb, bytesb, bufferb) {
                                                        if (errb !== null) {
                                                            return apps.errout(
                                                                {error: errb, name: "biddle_hash_stat_open_read_readBinary"}
                                                            );
                                                        }
                                                        if (bytesb > 0) {
                                                            hashExec(bufferb);
                                                        }
                                                    }
                                                );
                                        } else {
                                            node
                                                .fs
                                                .readFile(filepath, {
                                                    encoding: "utf8"
                                                }, function biddle_hash_stat_open_read_readFile(errc, dump) {
                                                    if (errc !== null && errc !== undefined) {
                                                        return apps.errout({error: errc, name: "biddle_hash_stat_open_read_readFile"});
                                                    }
                                                    hashExec(dump);
                                                });
                                        }
                                        return bytesa;
                                    }
                                );
                        });
                });
        }
    };
    apps.install     = function biddle_install(zippath, callback) {
        var flag        = {
                hash: false,
                late: false,
                zip : false
            },
            hashFile    = "",
            fileName    = "",
            dirs        = [],
            late        = (function biddle_install_late() {
                var sep  = (data.protocoltest.test(zippath) === true)
                        ? "/"
                        : node.path.sep;
                dirs     = zippath.split(sep);
                fileName = dirs.pop();
                return dirs.join(sep) + sep + "latest.txt";
            }()),
            compareHash = function biddle_install_compareHash() {
                apps.hash(
                    data.address.downloads + fileName,
                    "hashZip",
                    function biddle_install_compareHash_hash(hashZip) {
                        if (hashFile === hashZip) {
                            var location = "",
                                puba     = [],
                                pubs     = "";
                            if (data.protocoltest.test(zippath) === true) {
                                location = zippath
                                    .split("/")
                                    .pop();
                                puba     = zippath.split("/");
                                puba.pop();
                                pubs = puba.join("/");
                            } else {
                                location = apps.relToAbs(zippath, data.cwd);
                                pubs     = apps.relToAbs(
                                    zippath.slice(0, zippath.lastIndexOf(node.path.sep) + 1),
                                    data.cwd
                                );
                            }
                            apps.zip(function biddle_install_callback() {
                                node
                                    .fs
                                    .readFile(
                                        data.address.target + "package.json",
                                        function biddle_zip_childfunc_child_install(erf, filedata) {
                                            var status   = {
                                                    packjson: false,
                                                    remove  : false
                                                },
                                                packjson = {},
                                                variant  = "";
                                            if (erf !== null && erf !== undefined) {
                                                return apps.errout({error: erf, name: "biddle_zip_childfunc_child_install"});
                                            }
                                            packjson      = JSON.parse(filedata);
                                            data.packjson = packjson;
                                            variant       = (function biddle_zip_childfunc_child_install_variant() {
                                                var name = fileName.replace(packjson.name + "_", ""),
                                                    ver  = apps.sanitizef(packjson.version);
                                                if (name === "latest.zip" || name === ver + ".zip") {
                                                    return "";
                                                }
                                                if (name.indexOf("_latest.zip") === name.length - 11) {
                                                    name = name.slice(0, name.length - 11);
                                                } else {
                                                    ver = "_" + ver + ".zip";
                                                    name = name.slice(0, name.length - ver.length);
                                                }
                                                return name;
                                            }());
                                            if (data.internal === true) {
                                                // internal applications are used only to enhance biddle.
                                                if (data.installed.internal === undefined) {
                                                    data.installed.internal = {};
                                                }
                                                data
                                                    .installed
                                                    .internal[packjson.name] = {};
                                                data
                                                    .installed
                                                    .internal[packjson.name]
                                                    .location                = data.address.target;
                                                data
                                                    .installed
                                                    .internal[packjson.name]
                                                    .published               = pubs;
                                                if (packjson.test === undefined) {
                                                    data
                                                        .installed
                                                        .internal[packjson.name]
                                                        .test = "";
                                                } else {
                                                    data
                                                        .installed
                                                        .internal[packjson.name]
                                                        .test = packjson.test;
                                                }
                                                data
                                                    .installed
                                                    .internal[packjson.name]
                                                    .variant                 = variant;
                                                data
                                                    .installed
                                                    .internal[packjson.name]
                                                    .version                 = packjson.version;
                                            } else {
                                                data.installed[packjson.name] = {};
                                                data
                                                    .installed[packjson.name]
                                                    .location                 = data.address.target;
                                                data
                                                    .installed[packjson.name]
                                                    .published                = pubs;
                                                if (packjson.test === undefined) {
                                                    data
                                                        .installed[packjson.name]
                                                        .test = "";
                                                } else {
                                                    data
                                                        .installed[packjson.name]
                                                        .test = packjson.test;
                                                }
                                                data
                                                    .installed[packjson.name]
                                                    .variant                  = variant;
                                                data
                                                    .installed[packjson.name]
                                                    .version                  = packjson.version;
                                            }
                                            apps.writeFile(
                                                JSON.stringify(data.installed),
                                                data.abspath + "installed.json",
                                                function biddle_install_compareHash_hash_installedJSON() {
                                                    status.packjson = true;
                                                    if (status.remove === true) {
                                                        callback(packjson);
                                                    }
                                                }
                                            );
                                            apps.remove(
                                                data.abspath + "downloads" + node.path.sep + fileName,
                                                function biddle_install_compareHash_hash_remove() {
                                                    status.remove = true;
                                                    if (status.packjson === true) {
                                                        callback(packjson);
                                                    }
                                                }
                                            );
                                        }
                                    );
                            }, {
                                fileName: fileName,
                                location: location,
                                name    : ""
                            });
                        } else {
                            return apps.errout({
                                error: text.red + "Hashes don't match" + text.nocolor + " for " + zippath + ". File is" +
                                        " saved in the downloads directory and will not be installed.\r\nGenerated hash" +
                                        " - " + data.hashZip + "\r\nRequested hash - " + data.hashFile,
                                name : "biddle_install_compareHash"
                            });
                        }
                    }
                );
            };
        apps.get(zippath, fileName, function biddle_install_getzip() {
            flag.zip = true;
            if (flag.hash === true && flag.late === true) {
                compareHash();
            }
        });
        apps.get(
            zippath.replace(".zip", ".hash"),
            fileName,
            function biddle_install_gethash(fileData) {
                flag.hash = true;
                hashFile  = fileData;
                if (flag.zip === true && flag.late === true) {
                    compareHash();
                }
            }
        );
        apps.get(late, fileName, function biddle_install_getlate(fileData) {
            var name = "";
            if (dirs[dirs.length - 1] === "") {
                dirs.pop();
            }
            name = dirs[dirs.length - 1];
            if (typeof data.installed[name] === "object" && data.installed[name].version === fileData) {
                return apps.errout({
                    error: "This application is already installed at version " + text.cyan +
                            fileData + text.nocolor + ". To continue uninstall the application and try agai" +
                            "n: " + text.green + "biddle uninstall " + name + text.nocolor,
                    name : "biddle_install_getlate"
                });
            }
            flag.late = true;
            if (flag.zip === true && flag.hash === true) {
                compareHash();
            }
        });
    };
    apps.list        = function biddle_list() {
        var listtype = {},
            dolist   = function biddle_list_dolist(type) {
                var len    = 0,
                    a      = 0,
                    proper = (type === "published")
                        ? "Published"
                        : (data.internal === true)
                            ? text.bold + text.red + "Internally" + text.none + text.cyan + " installed"
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
                            b    = b + 1;
                        } while (b < pads[col]);
                        return item;
                    };
                listtype[type].sort();
                if (listtype[type].length === 0) {
                    console.log(
                        text.underline + text.cyan + proper + " applications:" + text.none
                    );
                    console.log("");
                    if (data.internal === true) {
                        console.log(
                            "No " + text.bold + text.red + "internal" + text.none + " applications are " +
                            type + " by biddle."
                        );
                    } else {
                        console.log("No applications are " + type + " by biddle.");
                    }
                    console.log("");
                } else {
                    console.log(
                        text.underline + text.cyan + proper + " applications:" + text.none
                    );
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
                        a = a + 1;
                    } while (a < len);
                    a = 0;
                    do {
                        console.log(
                            "* " + text.cyan + pad(listtype[type][a], "name") + text.nocolor + " - " + pad(data[type][listtype[type][a]][vert], "version") +
                            " - " + data[type][listtype[type][a]][loct]
                        );
                        a = a + 1;
                    } while (a < len);
                    console.log("");
                }
            };
        if (data.internal === true) {
            data.input[2] = "installed";
        } else if (data.input[2] !== "installed" && data.input[2] !== "published" && data.input[2] !== undefined) {
            data.input[2] = "both";
        }
        listtype = {
            installed: Object.keys(data.installed),
            published: Object.keys(data.published)
        };
        console.log("");
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
                    ers    = "",
                    restat = function biddle_makedir_stat_restat() {
                        node
                            .fs
                            .stat(
                                dirs.slice(0, ind + 1).join(node.path.sep),
                                function biddle_makedir_stat_restat_callback(erra, stata) {
                                    var erras = "";
                                    ind = ind + 1;
                                    if (erra !== null) {
                                        erras = erra.toString();
                                        if (erras.indexOf("no such file or directory") > 0 || erra.code === "ENOENT") {
                                            return node
                                                .fs
                                                .mkdir(
                                                    dirs.slice(0, ind).join(node.path.sep),
                                                    function biddle_makedir_stat_restat_callback_mkdir(errb) {
                                                        if (errb !== null && errb.toString().indexOf("file already exists") < 0) {
                                                            return apps.errout(
                                                                {error: errb, name: "biddle_makedir_stat_restat_callback_mkdir"}
                                                            );
                                                        }
                                                        if (ind < len) {
                                                            biddle_makedir_stat_restat();
                                                        } else {
                                                            callback();
                                                        }
                                                    }
                                                );
                                        }
                                        if (erras.indexOf("file already exists") < 0) {
                                            return apps.errout({error: erra, name: "biddle_makedir_stat_restat_callback"});
                                        }
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
                                }
                            );
                    };
                if (err !== null) {
                    ers = err.toString();
                    if (ers.indexOf("no such file or directory") > 0 || err.code === "ENOENT") {
                        dirs = dirToMake.split(node.path.sep);
                        if (dirs[0] === "") {
                            ind = ind + 1;
                        }
                        len = dirs.length;
                        return restat();
                    }
                    if (ers.indexOf("file already exists") < 0) {
                        return apps.errout({error: err, name: "biddle_makedir_stat"});
                    }
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
    apps.markdown    = function biddle_markdown() {
        var file = data.abspath + "readme.md",
            size = data.input[2];
        if (data.command === "markdown") {
            file = data.input[2];
            size = data.input[3];
        }
        node
            .fs
            .readFile(file, "utf8", function biddle_markdown_readfile(err, readme) {
                var lines     = [],
                    listly    = [],
                    output    = [],
                    para      = false,
                    ind       = "",
                    listr     = "",
                    b         = 0,
                    len       = 0,
                    bullet    = "",
                    codeblock = function biddle_markdown_readfile_blockcode() {
                        var blocks       = "",
                            spaces       = "nospace",
                            removespaces = function biddle_markdown_readfile_removespaces(x) {
                                if (spaces === "nospace") {
                                    spaces = x;
                                }
                                return x.slice(spaces.length);
                            },
                            blockstart   = function biddle_markdown_readfile_blockstart() {
                                var bs    = lines[b].replace(/\s+/g, ""),
                                    bsout = function biddle_markdown_readfile_blockstart_bsout(x) {
                                        return x;
                                    };
                                return bs.replace(/((~+)|(`+))/, bsout);
                            };
                        lines[b].replace(/^(\s+)/, removespaces);
                        if (spaces === "nospace") {
                            spaces = "";
                        }
                        blocks = blockstart();
                        output.push("");
                        b = b + 1;
                        if (b < len) {
                            if (lines[b].replace(/^(\s+)/, "").indexOf(blocks) === 0 && (/^(\s*((`{3,})|(~{3,}))+)/).test(lines[b]) === true) {
                                output.push("");
                            } else {
                                lines[b] = text.green + lines[b].replace(/^(\s+)/, removespaces) + text.nocolor;
                                do {
                                    if (lines[b].indexOf(blocks) > -1 && (/(((`{3,})|(~{3,}))+\s*)$/).test(lines[b]) === true) {
                                        lines[b] = "";
                                        output.push("");
                                        break;
                                    }
                                    output.push(
                                        ind + text.green + lines[b].replace(/^(\s+)/, removespaces) + text.nocolor
                                    );
                                    b = b + 1;
                                } while (b < len);
                                spaces = "nospace";
                            }
                        }
                    },
                    hr        = function biddle_markdown_readfile_hr(block) {
                        var item = lines[b]
                                .replace(/\s+/, "")
                                .charAt(0),
                            out  = "",
                            maxx = size - block.length,
                            inc  = 0;
                        do {
                            inc = inc + 1;
                            out = out + item;
                        } while (inc < maxx);
                        lines[b] = block + out;
                        para     = false;
                    },
                    parse     = function biddle_markdown_readfile_parse(item, listitem, cell) {
                        var block = false,
                            chars = [],
                            final = 0,
                            s     = (/\s/),
                            x     = 0,
                            y     = ind.length,
                            start = 0,
                            index = 0,
                            math  = 0,
                            quote = "",
                            wrap  = function biddle_markdown_readfile_parse_wrap(tick) {
                                var z      = x,
                                    format = function biddle_markdown_readfile_parse_wrap_format(eol) {
                                        if (block === true) {
                                            chars[eol] = "\n" + ind + "| ";
                                        } else {
                                            chars[eol] = "\n" + ind;
                                        }
                                        index = y + eol;
                                        if (chars[eol - 1] === " ") {
                                            chars[eol - 1] = "";
                                        } else if (chars[eol + 1] === " ") {
                                            chars.splice(eol + 1, 1);
                                            final = final - 1;
                                        }
                                    };
                                math = y + 2;
                                if (cell === true) {
                                    return;
                                }
                                if (tick === true) {
                                    do {
                                        z = z - 1;
                                    } while (chars[z + 1].indexOf(text.green) < 0 && z > index);
                                    if (z > index) {
                                        format(z);
                                    }
                                } else if (s.test(chars[x]) === true) {
                                    format(x);
                                } else {
                                    do {
                                        z = z - 1;
                                    } while (s.test(chars[z]) === false && z > index);
                                    if (z > index) {
                                        format(z);
                                    }
                                }
                            };
                        if (lines[b - 1] === "" && (/\u0020{4}\S/).test(item) === true && listitem === false) {
                            item = text.green + item + text.nocolor;
                            return item;
                        }
                        if (item.charAt(0) === ">") {
                            block = true;
                        }
                        if (listitem === true) {
                            item = item.replace(/^\s+/, "");
                        }
                        if ((/^(\s*>-+\s*)$/).test(item) === true) {
                            lines[b] = item.replace(/^(\s*>\s*)/, "");
                            hr(ind + "  | ");
                            return lines[b];
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
                                    x   = x - 1;
                                    y   = y + 4;
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
                            if (listitem === true) {
                                start = 2;
                            } else {
                                start = y - 1;
                            }
                        }
                        y = ind.length + 4;
                        if (listitem === true) {
                            math = y + 8;
                        } else {
                            math = y;
                        }
                        for (x = start; x < final; x = x + 1) {
                            if (quote === "") {
                                if (chars[x] === "*" && chars[x + 1] === "*") {
                                    quote = "**";
                                    chars.splice(x, 2);
                                    chars[x] = text.bold + chars[x];
                                    final    = final - 2;
                                } else if (chars[x] === "_" && chars[x + 1] === "_") {
                                    quote = "__";
                                    chars.splice(x, 2);
                                    chars[x] = text.bold + chars[x];
                                    final    = final - 2;
                                } else if (chars[x] === "*" && ((x === start && chars[x + 1] !== " ") || x > start)) {
                                    quote = "*";
                                    chars.splice(x, 1);
                                    chars[x] = text.yellow + chars[x];
                                    final    = final - 1;
                                } else if ((x === start || (/\s/).test(chars[x - 1]) === true) && chars[x] === "_" && ((x === start && chars[x + 1] !== " ") || x > start)) {
                                    quote = "_";
                                    chars.splice(x, 1);
                                    chars[x] = text.yellow + chars[x];
                                    final    = final - 1;
                                } else if (chars[x] === "b" && chars[x + 1] === "i" && chars[x + 2] === "x" && chars[x + 3] === "~") {
                                    quote = "`";
                                    chars.splice(x, 4);
                                    chars[x] = text.green + chars[x];
                                    final    = final - 4;
                                } else if (chars[x - 2] === "," && chars[x - 1] === " " && chars[x] === "(") {
                                    quote    = ")";
                                    chars[x] = chars[x] + text.cyan;
                                }
                            } else if (chars[x] === "b" && chars[x + 1] === "i" && chars[x + 2] === "x" && chars[x + 3] === "~" && quote === "`") {
                                quote = "";
                                chars.splice(x, 4);
                                if (chars[x] === undefined) {
                                    x = chars.length - 1;
                                }
                                chars[x] = chars[x] + text.nocolor;
                                final    = final - 4;
                                if (math > size && chars[x + 1] === " ") {
                                    x = x + 1;
                                    wrap(false);
                                }
                            } else if (chars[x] === ")" && quote === ")") {
                                quote    = "";
                                chars[x] = text.nocolor + chars[x];
                                if (math > size && chars[x + 1] === " ") {
                                    x = x + 1;
                                    wrap(false);
                                }
                            } else if (chars[x] === "*" && chars[x + 1] === "*" && quote === "**") {
                                quote = "";
                                chars.splice(x, 2);
                                chars[x - 1] = chars[x - 1] + text.normal;
                                final        = final - 2;
                            } else if (chars[x] === "*" && quote === "*") {
                                quote = "";
                                chars.splice(x, 1);
                                chars[x - 1] = chars[x - 1] + text.nocolor;
                                final        = final - 1;
                            } else if (chars[x] === "_" && chars[x + 1] === "_" && quote === "__") {
                                quote = "";
                                chars.splice(x, 2);
                                chars[x - 1] = chars[x - 1] + text.normal;
                                final        = final - 2;
                            } else if (chars[x] === "_" && (x + 1 === final || (/\s/).test(chars[x + 1]) === true) && quote === "_") {
                                quote = "";
                                chars.splice(x, 1);
                                chars[x - 1] = chars[x - 1] + text.nocolor;
                                final        = final - 1;
                            }
                            if (math > size) {
                                if (quote === "`") {
                                    wrap(true);
                                } else {
                                    wrap(false);
                                }
                            }
                            if (chars[x + 1] === undefined) {
                                break;
                            }
                            math = math + 1;
                        }
                        if (quote === "**") {
                            chars.pop();
                            chars[x - 1] = chars[x - 1] + text.normal;
                        } else if (quote === "*") {
                            chars.pop();
                            chars[x - 1] = chars[x - 1] + text.none;
                        } else if (quote === ")") {
                            chars[x - 1] = chars[x - 1] + text.nocolor;
                        } else if (quote === "`") {
                            chars.pop();
                            chars[x - 4] = chars[x - 4] + text.nocolor;
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
                    table     = function biddle_markdown_readfile_table() {
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
                            rows[0][d] = parse(rows[0][d].replace(/\s+/g, " ").replace(/^\s/, "").replace(
                                /\s$/,
                                ""
                            ), false, true);
                            lend       = rows[0][d]
                                .replace(/\u001b\[\d+m/g, "")
                                .length;
                            cols.push(lend);
                            d = d + 1;
                        } while (d < lens);
                        if (line.indexOf("|") > -1) {
                            do {
                                rows.push(line.split("|").slice(0, lens));
                                d = 0;
                                do {
                                    rows[rows.length - 1][d] = parse(
                                        rows[rows.length - 1][d].replace(/\s+/g, " ").replace(
                                            /^\s/,
                                            ""
                                        ).replace(/\s$/, ""),
                                        false,
                                        true
                                    );
                                    lend                     = rows[rows.length - 1][d]
                                        .replace(/\u001b\[\d+m/g, "")
                                        .length;
                                    if (lend > cols[d]) {
                                        cols[d] = lend;
                                    }
                                    if (rows[rows.length - 1][d] === "\u2713") {
                                        rows[rows.length - 1][d] = text.bold + text.green + "\u2713" + text.none;
                                    } else if (rows[rows.length - 1][d] === "X") {
                                        rows[rows.length - 1][d] = text.bold + text.red + "X" + text.none;
                                    } else if (rows[rows.length - 1][d] === "?") {
                                        rows[rows.length - 1][d] = text.bold + text.yellow + "?" + text.none;
                                    }
                                    d = d + 1;
                                } while (d < lens);
                                c = c + 1;
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
                                        e          = e + 1;
                                        rows[c][d] = rows[c][d] + " ";
                                    } while (e < cols[d]);
                                } else {
                                    do {
                                        e          = e + 1;
                                        rows[c][d] = rows[c][d] + " ";
                                    } while (e < cols[d] + 1);
                                }
                                if (c === 0) {
                                    if (d > 0) {
                                        rows[c][d] = text.underline + " " + rows[c][d] + text.normal;
                                    } else {
                                        rows[c][d] = ind + text.underline + rows[c][d] + text.normal;
                                    }
                                } else {
                                    if (d > 0) {
                                        rows[c][d] = " " + rows[c][d];
                                    } else {
                                        rows[c][d] = ind + rows[c][d];
                                    }
                                }
                                d = d + 1;
                            } while (d < lens);
                            output.push(rows[c].join(""));
                            c = c + 1;
                            b = b + 1;
                        } while (c < lend);
                        b    = b + 1;
                        para = false;
                    },
                    headings  = function biddle_markdown_readfile_headings(color, level) {
                        if (level === 1) {
                            ind = "";
                        } else if (level === 2) {
                            ind = "  ";
                        } else if (level === 3) {
                            ind = "    ";
                        } else if (level === 4) {
                            ind = "      ";
                        } else if (level === 5) {
                            ind = "        ";
                        } else if (level === 6) {
                            ind = "          ";
                        }
                        listly   = [];
                        lines[b] = lines[b].replace(/^(\s*#+\s+)/, "");
                        if ((/(\\#)/).test(lines[b]) === true) {
                            lines[b] = lines[b].replace(/\\#/g, "#");
                        } else {
                            lines[b] = lines[b].replace(/(\s*#*\s*)$/, "");
                        }
                        lines[b] = ind.slice(2) + text.underline + text.bold + text[color] + lines[b] +
                                text.none;
                        para     = false;
                    };
                if (err !== null && err !== undefined) {
                    return apps.errout({error: err, name: "biddle_markdown_readfile"});
                }
                readme = (function biddle_markdown_readfile_removeImages() {
                    var readout = [],
                        j       = readme.split(""),
                        i       = 0,
                        ilen    = j.length,
                        brace   = "",
                        code    = (j[0] === " " && j[1] === " " && j[2] === " " && j[3] === " ");
                    for (i = 0; i < ilen; i = i + 1) {
                        if (brace === "") {
                            if (j[i] === "\r") {
                                if (j[i + 1] === "\n") {
                                    j[i] = "";
                                } else {
                                    j[i] = "\n";
                                }
                                if (j[i + 1] === "`" && j[i + 2] === "`" && j[i + 3] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === "`" && j[i + 3] === "`" && j[i + 4] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === "`" && j[i + 4] === "`" && j[i + 5] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === " " && j[i + 4] === "`" && j[i + 5] === "`" && j[i + 6] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === " " && j[i + 4] === " ") {
                                    code = true;
                                } else {
                                    code = false;
                                }
                            } else if (j[i] === "\n") {
                                if (j[i + 1] === "`" && j[i + 2] === "`" && j[i + 3] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === "`" && j[i + 3] === "`" && j[i + 4] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === "`" && j[i + 4] === "`" && j[i + 5] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === " " && j[i + 4] === "`" && j[i + 5] === "`" && j[i + 6] === "`") {
                                    code = true;
                                    brace = "```";
                                } else if (j[i + 1] === " " && j[i + 2] === " " && j[i + 3] === " " && j[i + 4] === " ") {
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
                        } else if (brace === "```" && j[i] === "`" && j[i + 1] === "`" && j[i + 2] === "`" && (/((\r|\n)(\u0020|\t)*)$/).test(j.slice(i - 4, i)) === true) {
                            code  = false;
                            brace = "";
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
                for (b = 0; b < len; b = b + 1) {
                    if ((/^(\s*)$/).test(lines[b]) === true) {
                        lines[b] = "";
                        para     = false;
                    } else if ((/^((\*|-|_){3})$/).test(lines[b].replace(/\s+/g, "")) === true && (/^(\s{0,3})/).test(lines[b]) === true && (lines[b].indexOf("-") < 0 || lines[b - 1].length < 1)) {
                        hr("");
                    } else if ((/-{3,}\s*\|\s*-{3,}/).test(lines[b + 1]) === true) {
                        table();
                    } else if ((/^(\s*((`{3,})|(~{3,}))+)/).test(lines[b]) === true) {
                        codeblock();
                    } else if ((/^(\s{0,3}#{6,6}\s)/).test(lines[b]) === true) {
                        headings("purple", 6);
                    } else if ((/^(\s{0,3}#{5,5}\s)/).test(lines[b]) === true) {
                        headings("blue", 5);
                    } else if ((/^(\s{0,3}#{4,4}\s)/).test(lines[b]) === true) {
                        headings("yellow", 4);
                    } else if ((/^(\s{0,3}#{3,3}\s)/).test(lines[b]) === true) {
                        headings("green", 3);
                    } else if ((/^(\s{0,3}#{2,2}\s)/).test(lines[b]) === true) {
                        headings("cyan", 2);
                    } else if ((/^(\s{0,3}#\s)/).test(lines[b]) === true) {
                        headings("red", 1);
                    } else if ((/^(\s{0,3}=+\s*)$/).test(lines[b + 1]) === true && (/^(\s{0,3}>)/).test(lines[b]) === false && (/^(\s*)$/).test(lines[b]) === false) {
                        headings("red", 1);
                        lines.splice(b + 1, 1);
                        len = len - 1;
                    } else if ((/^(\s{0,3}-+\s*)$/).test(lines[b + 1]) === true && (/^(\s{0,3}>)/).test(lines[b]) === false && (/^(\s*)$/).test(lines[b]) === false) {
                        headings("cyan", 2);
                        lines.splice(b + 1, 1);
                        len = len - 1;
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
                        lines[b] = parse(lines[b], true, false).replace(
                            /\*|-/,
                            text.bold + text.red + bullet + text.none
                        );
                        para     = true;
                    } else if (lines[b].indexOf("    ") === 0) {
                        lines[b] = text.green + lines[b] + text.nocolor;
                    } else if ((/^\s*>/).test(lines[b]) === true) {
                        listly   = [];
                        lines[b] = parse(lines[b], false, false);
                        if (b < len - 1 && (/^(\s*)$/).test(lines[b + 1]) === false) {
                            lines[b + 1] = ">" + lines[b + 1];
                        }
                        para = true;
                    } else if (para === true) {
                        listly = [];
                        len    = len - 1;
                        b      = b - 1;
                        output.pop();
                        lines[b] = lines[b] + lines[b + 1];
                        lines.splice(b + 1, 1);
                        lines[b] = parse(
                            lines[b].replace(/\s+/g, " ").replace(/^\s/, ""),
                            false,
                            false
                        );
                        para     = true;
                    } else {
                        para     = true;
                        listly   = [];
                        lines[b] = parse(lines[b], false, false);
                    }
                    output.push(lines[b]);
                }
                if (output[output.length - 1] === undefined) {
                    output.pop();
                }
                output[output.length - 1] = output[output.length - 1] + text.none;
                if (data.platform === "win32") {
                    ind = output.join("\r\n");
                } else {
                    ind = output.join("\n");
                }
                if ((data.command === "help" && data.input[3] === "test") || (data.command === "markdown" && data.input[4] === "test")) {
                    ind = "\"" + ind
                        .replace(/\r\n/g, "\n")
                        .slice(0, 8192)
                        .replace(/(\\(\w+)?)$/, "")
                        .replace(/\\(?!(\\))/g, "\\\\")
                        .replace(/\n/g, "\\n")
                        .replace(/"/g, "\\\"")
                        .replace(/\\\\"/g, "\\\"")
                        .replace(/(\s+)$/, "")
                        .replace(/(\\n)$/, "")
                        .replace(/\u001b\[39m\u001b\[0m/g, "\" + text.none + \"")
                        .replace(/\u001b\[0m/g, "\" + text.normal + \"")
                        .replace(/\u001b\[1m/g, "\" + text.bold + \"")
                        .replace(/\u001b\[4m/g, "\" + text.underline + \"")
                        .replace(/\u001b\[31m/g, "\" + text.red + \"")
                        .replace(/\u001b\[32m/g, "\" + text.green + \"")
                        .replace(/\u001b\[33m/g, "\" + text.yellow + \"")
                        .replace(/\u001b\[34m/g, "\" + text.blue + \"")
                        .replace(/\u001b\[35m/g, "\" + text.purple + \"")
                        .replace(/\u001b\[36m/g, "\" + text.cyan + \"")
                        .replace(/\u001b\[39m/g, "\" + text.nocolor + \"")
                        .replace(/\u0020\+\u0020""\u0020\+\u0020/g, " + ") + "\"";
                }
                console.log(ind);
                process.exit(0);
            });
    };
    apps.publish     = function biddle_publish() {
        var filedata    = [],
            varlen      = 0,
            publoc      = "",
            primaryzip  = "",
            pjsonname   = (data.input[2] === undefined)
                ? data.abspath + "package.json"
                : apps.relToAbs(
                    data.input[2].replace(/(\/|\\)$/, "") + node.path.sep + "package.json",
                    data.cwd
                ),
            varnames    = {},
            variants    = [],
            indexfile   = function biddle_publish_indexfile() {
                var rows   = [],
                    file   = "<?xml version=\"1.0\" encoding=\"UTF-8\" ?><!DOCTYPE html PUBLIC \"-//W3C//DTD" +
                            " XHTML 1.1//EN\" \"http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd\"><html xml:la" +
                            "ng=\"en\" xmlns=\"http://www.w3.org/1999/xhtml\"><head><title>!!app name!! - P" +
                            "ublications</title> <meta content=\"application/xhtml+xml;charset=UTF-8\" http" +
                            "-equiv=\"Content-Type\"/> <meta content=\"text/css\" http-equiv=\"content-styl" +
                            "e-type\"/> <meta content=\"application/javascript\" http-equiv=\"content-scrip" +
                            "t-type\"/> <meta content=\"Global\" name=\"distribution\"/> <meta content=\"wi" +
                            "dth=device-width, initial-scale=1\" name=\"viewport\"/> <meta content=\"index," +
                            " follow\" name=\"robots\"/> <style type=\"text/css\">body{background:#e8ddd8;f" +
                            "ont-family:\"Century Gothic\",\"Trebuchet MS\";font-size:10px;margin:0;padding" +
                            ":1em}table{border-collapse:collapse}td,th{border:#333 solid 0.09em;font-size:1" +
                            ".6em;padding:0.5em 1em}h1{background:#fff8e8;border:0.05em solid #321;display:" +
                            "inline-block;margin:0;padding:0.2em}p{font-size:1.6em}tfoot td{font-family:mon" +
                            "ospace;font-size:1.2em}tfoot,thead{background:#e8e8e8}thead th{cursor:pointer;" +
                            "height:1.5em;text-align:center;vertical-align:baseline}tbody tr:hover{backgrou" +
                            "nd:#dfd}tr.odd{background:#e8e8ff}tr.even{background:#fff}.sort{float:left;mar" +
                            "gin:0 0.5em 0 -0.5em;width:1em}td[data-size]{text-align:right}.hash{display:bl" +
                            "ock;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:n" +
                            "owrap;width:6em}</style></head><body><h1>!!app name!! - Publications</h1><p>Cl" +
                            "ick on table headings to sort.</p><table><thead><tr><th><span aria-describedby" +
                            "=\"aria-arrow\" class=\"sort\" style=\"visibility:hidden;\">&#x25bc;</span> Ve" +
                            "rsion</th><th><span aria-describedby=\"aria-arrow\" class=\"sort\" style=\"vis" +
                            "ibility:hidden;\">&#x25bc;</span> Date</th><th><span aria-describedby=\"aria-a" +
                            "rrow\" class=\"sort\" style=\"visibility:hidden;\">&#x25bc;</span> Size</th><t" +
                            "h><span aria-describedby=\"aria-arrow\" class=\"sort\" style=\"visibility:hidd" +
                            "en;\">&#x25bc;</span> Variant Name</th><th><span aria-describedby=\"aria-arrow" +
                            "\" class=\"sort\" style=\"visibility:hidden;\">&#x25bc;</span> Zip File</th><t" +
                            "h><span aria-describedby=\"aria-arrow\" class=\"sort\" style=\"visibility:hidd" +
                            "en;\">&#x25bc;</span> Hash</th></tr></thead><tbody>!!row!!</tbody><tfoot><tr><" +
                            "td colspan=\"6\"><a href=\"https://github.com/prettydiff/biddle\">biddle</a> i" +
                            "nstall !!install!!</td></tr></tfoot></table><p aria-hidden=\"true\" id=\"aria-" +
                            "arrow\" style=\"display:none;\"></p><script src=\"biddlesort.js\" type=\"appli" +
                            "cation/javascript\"></script></body></html>",
                    script = "(function(){var abspath=location.href.replace(/^(file:\\/\\/)/,\"\").replace(/" +
                            "(index\\.xhtml)$/,\"\"),headings=document.getElementsByTagName(\"thead\")[0].g" +
                            "etElementsByTagName(\"th\"),hlen=headings.length,a=0,start=1,sorter=function(h" +
                            "eading){var b=0,ind=0,len=headings.length,span=\"\",rows=[],rowlist=[],tbody=d" +
                            "ocument.getElementsByTagName(\"tbody\")[0],ascend=false,rowsort=function(a,b){" +
                            "var vala=\"\",valb=\"\";if(ind===1){vala=Number(a.getElementsByTagName(\"td\")" +
                            "[1].getAttribute(\"data-date\"));valb=Number(b.getElementsByTagName(\"td\")[1]" +
                            ".getAttribute(\"data-date\"))}else if(ind===2){vala=Number(a.getElementsByTagN" +
                            "ame(\"td\")[2].getAttribute(\"data-size\"));valb=Number(b.getElementsByTagName" +
                            "(\"td\")[2].getAttribute(\"data-size\"))}else if(ind===5){vala=a.getElementsBy" +
                            "TagName(\"td\")[ind].getElementsByTagName(\"a\")[0].innerHTML.toLowerCase();va" +
                            "lb=b.getElementsByTagName(\"td\")[ind].getElementsByTagName(\"a\")[0].innerHTM" +
                            "L.toLowerCase()}else{vala=a.getElementsByTagName(\"td\")[ind].innerHTML.toLowe" +
                            "rCase();valb=b.getElementsByTagName(\"td\")[ind].innerHTML.toLowerCase()}if(as" +
                            "cend===true){if(vala>valb){return 1}else{return -1}}else{if(vala>valb){return " +
                            "-1}else{return 1}}};do{span=headings[b].getElementsByTagName(\"span\")[0];if(h" +
                            "eading===headings[b]){ind=b;if(span.style.visibility===\"visible\"){if(span.in" +
                            "nerHTML===\"▲\"){span.innerHTML=\"▼\"}else{span.innerHTML=\"▲\"}}else{span.sty" +
                            "le.visibility=\"visible\"}if(span.innerHTML===\"▲\"){ascend=true;document.getE" +
                            "lementById(\"aria-arrow\").innerHTML=\"Sorting by \"+headings[b].lastChild.tex" +
                            "tContent+\" ascending\"}else{ascend=false;document.getElementById(\"aria-arrow" +
                            "\").innerHTML=\"Sorting by \"+headings[b].lastChild.textContent+\" descending" +
                            "\"}}else{span.style.visibility=\"hidden\"}b=b+1}while(b<len);rowlist=[];rows=t" +
                            "body.getElementsByTagName(\"tr\");len=rows.length;b=0;do{rowlist.push(rows[b])" +
                            ";b=b+1}while(b<len);rowlist.sort(rowsort);b=0;do{if(b%2===0){rowlist[b].setAtt" +
                            "ribute(\"class\",\"even\")}else{rowlist[b].setAttribute(\"class\",\"odd\")}tbo" +
                            "dy.removeChild(rowlist[b]);tbody.appendChild(rowlist[b]);b=b+1}while(b<len)};i" +
                            "f(abspath.charAt(abspath.length-1)!==\"/\"){abspath=abspath+\"/\"}document.get" +
                            "ElementById(\"address\").innerHTML=abspath;do{headings[a].onclick=function(e){" +
                            "sorter(this);e.preventDefault();return false};a=a+1}while(a<hlen);document.get" +
                            "ElementsByTagName(\"thead\")[0].getElementsByTagName(\"th\")[start].getElement" +
                            "sByTagName(\"span\")[0].innerHTML=\"▲\";document.getElementsByTagName(\"thead" +
                            "\")[0].getElementsByTagName(\"th\")[start].getElementsByTagName(\"span\")[0].s" +
                            "tyle.visibility=\"visible\";sorter(document.getElementsByTagName(\"thead\")[0]" +
                            ".getElementsByTagName(\"th\")[start])}());";
                file = file.replace(/\!\!app\u0020name\!\!/g, data.packjson.name);
                file = file.replace(
                    /\!\!install\!\!/,
                    "<span id=\"address\"></span>" + primaryzip
                );
                if (typeof data.packjson.author === "string") {
                    file = file.replace(
                        "</title> <",
                        "</title> <meta content=\"" + data.packjson.author.replace(/\s+/g, " ").replace(/"/g, "") +
                                "\" name=\"author\"/> <"
                    );
                }
                filedata.forEach(function biddle_publish_indexfile_filedata(val) {
                    var build    = [],
                        monthval = val
                            .date
                            .slice(4, 6),
                        month    = {
                            "01": "January",
                            "02": "February",
                            "03": "March",
                            "04": "April",
                            "05": "May",
                            "06": "June",
                            "07": "July",
                            "08": "August",
                            "09": "September",
                            "10": "October",
                            "11": "November",
                            "12": "December"
                        },
                        varname  = (val.variant === "")
                            ? "Full Application"
                            : val.variant;
                    build.push("<tr><td>");
                    build.push(val.version);
                    build.push("</td><td data-date=\"");
                    build.push(val.date);
                    build.push("\">");
                    build.push(val.date.slice(6));
                    build.push("\u0020");
                    build.push(month[monthval]);
                    build.push("\u0020");
                    build.push(val.date.slice(0, 4));
                    build.push("</td><td data-size=\"");
                    build.push(val.size);
                    build.push("\">");
                    build.push(apps.commas(Number(val.size)));
                    build.push("</td><td>");
                    build.push(varname);
                    build.push("</td><td><a href=\"");
                    build.push(val.filename);
                    build.push("\">");
                    build.push(val.filename);
                    build.push("</a></td><td><a class=\"hash\" href=\"");
                    build.push(val.filename.replace(/(\.zip)$/, ".hash"));
                    build.push("\">");
                    build.push(val.hash);
                    build.push("</a></td></tr>");
                    rows.push(build.join(""));
                });
                file = file.replace(/\!\!row\!\!/, rows.join(""));
                apps.writeFile(
                    file,
                    publoc + "index.xhtml",
                    function biddle_publish_indexfile_readIndex_index_writeXhtml() {
                        return true;
                    }
                );
                apps.writeFile(
                    script,
                    publoc + "biddlesort.js",
                    function biddle_publish_indexfile_readIndex_writeScript() {
                        return true;
                    }
                );
            },
            zippy       = function biddle_publish_zippy_init() {
                return;
            },
            variantsDir = function biddle_publish_variantsDir(value) {
                var varobj = (value === "biddletempprimary")
                    ? {}
                    : data
                        .packjson
                        .publication_variants[value];
                value           = apps.sanitizef(value);
                varnames[value] = true;
                if (typeof varobj.exclusions !== "object" || typeof varobj.exclusions.join !== "function") {
                    varobj.exclusions = [];
                }
                varobj.exclusions = varobj
                    .exclusions
                    .concat(data.ignore);
                varobj
                    .exclusions
                    .sort();
                apps.copy(
                    data.input[2],
                    data.abspath + "temp" + node.path.sep + value,
                    varobj.exclusions,
                    function biddle_publish_variantsDir_copy() {
                        var complete = function biddle_publish_variantsDir_copy_complete() {
                                var location = data.abspath + "temp" + node.path.sep + value,
                                    valname  = (value === "biddletempprimary")
                                        ? ""
                                        : value;
                                zippy({location: location, name: valname});
                            },
                            tasks    = function biddle_publish_variantsDir_copy_tasks() {
                                node.child(
                                    varobj.tasks[0],
                                    function biddle_publish_variantsDir_copy_tasks_child(ert, stdoutt, stdert) {
                                        var len = varobj.tasks.length - 1;
                                        if (ert !== null) {
                                            console.log(
                                                text.bold + text.red + "Error:" + text.none + " with variant " + value + " on p" +
                                                "ublish task"
                                            );
                                            console.log(varobj.tasks[0]);
                                            console.log(ert);
                                        } else if (stdert !== null && stdert !== "") {
                                            console.log(
                                                text.bold + text.red + "Error:" + text.none + " with variant " + value + " on p" +
                                                "ublish task"
                                            );
                                            console.log(varobj.tasks[0]);
                                            console.log(stdert);
                                        } else {
                                            console.log(
                                                text.bold + text.green + "Complete:" + text.none + " with variant " + value + " on publish task"
                                            );
                                            console.log(varobj.tasks[0]);
                                            console.log(stdoutt);
                                        }
                                        varobj
                                            .tasks
                                            .splice(0, 1);
                                        if (len > 0) {
                                            biddle_publish_variantsDir_copy_tasks();
                                        } else {
                                            complete();
                                        }
                                    }
                                );
                            };
                        if (varobj.tasks === "object" && varobj.tasks.length > 0) {
                            tasks();
                        } else {
                            complete();
                        }
                    }
                );
            },
            execution   = function biddle_publish_execution() {
                variants.push("biddletempprimary");
                varnames.biddletempprimary = true;
                varlen                     = (data.latestVersion === true)
                    ? variants.length * 2
                    : variants.length;
                apps.makedir("temp", function biddle_publish_execution_variantDir() {
                    if (data.parallel === true) {
                        variants.forEach(variantsDir);
                    } else {
                        variantsDir("biddletempprimary");
                    }
                });
            },
            preexec     = function biddle_publish_preexec() {
                if (data.address.target.indexOf(node.path.sep + "publications") + 1 === data.address.target.length - 13) {
                    data.address.target = data.address.target + apps.sanitizef(data.packjson.name) +
                            node.path.sep;
                }
                apps.makedir(data.address.target, function biddle_publish_preexec_makedir() {
                    if (data.latestVersion === true) {
                        varlen      = varlen * 2;
                        data
                            .published[data.packjson.name]
                            .latest = data.packjson.version;
                        apps.writeFile(
                            data.packjson.version,
                            data.address.target + "latest.txt",
                            function biddle_zip_makedir_latestTXT() {
                                execution();
                            }
                        );
                    } else {
                        execution();
                    }
                });
            };
        zippy = function biddle_publish_zippy(vardata) {
            apps.zip(function biddle_publish_zippy_zip(zipfilename) {
                node
                    .fs
                    .stat(zipfilename, function biddle_publish_zippy_zip_stat(erstat, stats) {
                        var filename = zipfilename
                                .split(node.path.sep)
                                .pop(),
                            safevars = filename
                                .replace(data.packjson.name, "")
                                .split("_"),
                            variant  = "",
                            sdate    = new Date(),
                            year     = String(sdate.getUTCFullYear()),
                            month    = String(sdate.getMonth() + 1),
                            day      = String(sdate.getDate());
                        if (erstat !== null) {
                            return apps.errout({error: erstat, name: "biddle_publish_zippy_zip_stat"});
                        }
                        if (typeof stats !== "object") {
                            return apps.errout(
                                {error: "stats is not an object, from node.fs.stat", name: "biddle_publish_zippy_zip_stat"}
                            );
                        }
                        if (month.length < 2) {
                            month = "0" + month;
                        }
                        if (day.length < 2) {
                            day = "0" + day;
                        }
                        if (safevars.length > 2) {
                            variant = safevars[1];
                        }
                        apps.hash(zipfilename, "hashFile", function biddle_publish_zippy_zip_hash() {
                            var hashname = zipfilename.replace(".zip", ".hash"),
                                a        = variants.length;
                            apps.remove(hashname, function biddle_publish_zippy_zip_hash_remove() {
                                apps.writeFile(
                                    data.hashFile,
                                    hashname,
                                    function biddle_publish_zippy_zip_hash_remove_writehash() {
                                        if (vardata.name === "" && (primaryzip === "" || zipfilename.indexOf("_latest.zip") > 0)) {
                                            primaryzip = filename;
                                        }
                                        filedata.push({
                                            date    : year + month + day,
                                            filename: filename,
                                            hash    : data.hashFile,
                                            size    : stats.size,
                                            variant : variant,
                                            version : data.packjson.version
                                        });
                                        varlen = varlen - 1;
                                        if (varlen < 1) {
                                            apps.writeFile(
                                                JSON.stringify(data.published),
                                                data.abspath + "published.json",
                                                function biddle_publish_zippy_zip_hash_writeJSON() {
                                                    apps.remove(
                                                        data.abspath + "temp",
                                                        function biddle_publish_zippy_zip_hash_writeJSON_removeTemp() {
                                                            return true;
                                                        }
                                                    );
                                                }
                                            );
                                            node
                                                .fs
                                                .readFile(
                                                    publoc + "filedata.json",
                                                    function biddle_publish_zippy_zip_stat_readfiledata(erd, catalogue) {
                                                        var parsed = {},
                                                            x      = 0;
                                                        if (erd !== null && erd !== "") {
                                                            if (erd.toString().indexOf("no such file or directory") > 0) {
                                                                apps.writeFile(
                                                                    JSON.stringify({filedata: filedata}),
                                                                    publoc + "filedata.json",
                                                                    function biddle_publish_zippy_zip_stat_readfiledata_writeNew() {
                                                                        return true;
                                                                    }
                                                                );
                                                                return indexfile();
                                                            }
                                                            return apps.errout(
                                                                {error: erd, name: "biddle_publish_zippy_zip_stat_readfiledata"}
                                                            );
                                                        }
                                                        parsed = JSON.parse(catalogue);
                                                        x      = parsed.filedata.length - 1;
                                                        do {
                                                            if (parsed.filedata[x].filename.indexOf("_latest.zip") === parsed.filedata[x].filename.length - 11) {
                                                                parsed
                                                                    .filedata
                                                                    .splice(x, 1);
                                                            }
                                                            x = x - 1;
                                                        } while (x > -1);
                                                        filedata = filedata.concat(parsed.filedata);
                                                        apps.writeFile(
                                                            JSON.stringify({filedata: filedata}),
                                                            publoc + "filedata.json",
                                                            function biddle_publish_zippy_zip_stat_readfiledata_write() {
                                                                return true;
                                                            }
                                                        );
                                                        indexfile();
                                                    }
                                                );
                                        }
                                    }
                                );
                            });
                            if (data.parallel === false) {
                                do {
                                    a = a - 1;
                                    if (variants[a] === vardata.name || (variants[a] === "biddletempprimary" && vardata.name === "")) {
                                        variants.splice(a, 1);
                                        a = variants.length;
                                        if (a > 0) {
                                            return variantsDir(variants[variants.length - 1]);
                                        }
                                        break;
                                    }
                                } while (a > 0);
                            }
                        });
                    });
            }, vardata);
        };
        apps.getpjson(pjsonname, function biddle_publish_callback() {
            if (data.published[data.packjson.name] !== undefined && data.published[data.packjson.name].versions.indexOf(data.packjson.version) > -1) {
                return apps.errout({
                    error: "Attempted to publish " + data.packjson.name + " over existing version " +
                            text.bold + text.red + data.packjson.version + text.none,
                    name : "biddle_publish_execution"
                });
            }
            data.packjson.name = apps.sanitizef(data.packjson.name);
            if (data.input[3] === undefined || data.address.target !== apps.relToAbs(data.input[3], data.cwd) + node.path.sep) {
                publoc              = data.address.publications + apps.sanitizef(data.packjson.name) + node.path.sep;
            } else {
                publoc = data.address.target + apps.sanitizef(data.packjson.name) + node.path.sep;
            }
            data.address.target = publoc;
            if (data.published[data.packjson.name] !== undefined && data.input[3] !== undefined) {
                data.input = data
                    .input
                    .slice(0, 3);
            } else if (data.published[data.packjson.name] === undefined) {
                data.published[data.packjson.name] = {};
                data
                    .published[data.packjson.name]
                    .versions                      = [];
                data
                    .published[data.packjson.name]
                    .latest                        = "";
                data
                    .published[data.packjson.name]
                    .directory                     = data.address.target;
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
                if (sem.length === 1 && cur.length === 1 && sem.indexOf("-") > 0) {
                    sem = sem[0].split("-");
                    cur = cur[0].split("-");
                }
                len = (Math.max(sem, cur));
                do {
                    if (isNaN(sem[a]) === false && isNaN(cur[a]) === false) {
                        if (Number(sem[a]) > Number(cur[a])) {
                            return true;
                        }
                        if (Number(cur[a]) < Number(sem[a])) {
                            return false;
                        }
                    }
                    if (sem[a] === undefined) {
                        return true;
                    }
                    if (cur[a] === undefined) {
                        return false;
                    }
                    if (isNaN(cur[a]) === true && isNaN(sem[a]) === false) {
                        return false;
                    }
                    a = a + 1;
                } while (a < len);
                return true;
            }());
            variants           = (typeof data.packjson.publication_variants === "object")
                ? Object.keys(data.packjson.publication_variants)
                : [];
            preexec();
        });
    };
    apps.readBinary  = function biddle_readBinary(filePath, callback) {
        var size        = 0,
            fdescript   = 0,
            writeBinary = function biddle_readBinary_writeBinary() {
                node
                    .fs
                    .open(
                        data.address.downloads + node.path.sep + data.fileName,
                        "w",
                        function biddle_readBinary_writeBinary_writeopen(errx, fd) {
                            var buffer = new Buffer(size);
                            if (errx !== null) {
                                return apps.errout(
                                    {error: errx, name: "biddle_readBinary_writeBinary_writeopen"}
                                );
                            }
                            node
                                .fs
                                .read(
                                    fdescript,
                                    buffer,
                                    0,
                                    size,
                                    0,
                                    function biddle_readBinary_writeBinary_writeopen_read(erry, ready, buffy) {
                                        if (erry !== null) {
                                            return apps.errout(
                                                {error: erry, name: "biddle_readBinary_writeBinary_writeopen_read"}
                                            );
                                        }
                                        if (ready > 0) {
                                            node
                                                .fs
                                                .write(
                                                    fd,
                                                    buffy,
                                                    0,
                                                    size,
                                                    function biddle_readBinary_writeBinary_writeopen_read_write(errz, written, buffz) {
                                                        if (errz !== null) {
                                                            return apps.errout(
                                                                {error: errz, name: "biddle_readBinary_writeBinary_writeopen_read_write"}
                                                            );
                                                        }
                                                        if (written < 1) {
                                                            return apps.errout({
                                                                error: "Reading binary file " + filePath + " but 0 bytes were read.",
                                                                name : "biddle_readBinary_writeBinary_writeopen_read_write"
                                                            });
                                                        }
                                                        callback(buffz.toString("utf8", 0, written));
                                                    }
                                                );
                                        }
                                    }
                                );
                        }
                    );
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
                            .read(
                                fd,
                                buffer,
                                0,
                                length,
                                1,
                                function biddle_readyBinary_stat_open_read(errr, read, buff) {
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
                                            .readFile(
                                                filePath,
                                                "utf8",
                                                function biddle_readBinary_stat_open_read_readFile(errf, fileData) {
                                                    if (errf !== null && errf !== undefined) {
                                                        return apps.errout(
                                                            {error: errf, name: "biddle_readBinary_stat_open_read_readFile"}
                                                        );
                                                    }
                                                    if ((data.command === "update" || data.command === "install") && (/(\.hash)$/).test(filePath) === true) {
                                                        data.hashFile = fileData;
                                                        callback(fileData);
                                                    } else if (data.command === "status") {
                                                        callback(fileData, filePath);
                                                    } else if ((data.command === "update" || data.command === "install") && (/(latest\.txt)$/).test(filePath) === true) {
                                                        callback(fileData);
                                                    } else {
                                                        apps.writeFile(fileData, apps.sanitizef(filePath), callback);
                                                    }
                                                }
                                            );
                                    }
                                    return read;
                                }
                            );
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
            return apps.errout(
                {error: "Unqualified operation: readlist() but command is not published or installed.", name: "biddle_readlist"}
            );
        }
        node
            .fs
            .readFile(
                datalist + ".json",
                "utf8",
                function biddle_readlist_readFile(err, fileData) {
                    var jsondata = JSON.parse(fileData);
                    if (err !== null && err !== undefined) {
                        return apps.errout({error: err, name: "biddle_readlist_readFile"});
                    }
                    data[datalist]        = jsondata[datalist];
                    data.status[datalist] = true;
                }
            );
    };
    apps.relToAbs    = function biddle_relToAbs(filepath, reference) {
        var abs     = reference
                .replace(/((\/|\\)+)$/, "")
                .split(node.path.sep),
            rel     = filepath
                .replace(/\\|\//g, node.path.sep)
                .split(node.path.sep),
            cur     = data
                .cwd
                .split(node.path.sep),
            a       = 0,
            b       = 0,
            reftest = false;
        if (data.platform === "win32") {
            if ((/^(\w:\\)/).test(filepath) === true) {
                return filepath;
            }
            if ((/^(\w:\\)/).test(reference) === true) {
                reftest = true;
            }
        } else {
            if (filepath.charAt(0) === "/") {
                return filepath;
            }
            if (reference.charAt(0) === "/") {
                reftest = true;
            }
        }
        if (data.cwd !== reference && reftest === false) {
            if (abs[0] === "..") {
                do {
                    cur.pop();
                    abs.splice(0, 1);
                } while (cur[0] === "..");
            } else if (cur[0] === ".") {
                cur.splice(0, 1);
            }
            abs = cur.concat(abs);
        }
        if (rel[0] === "..") {
            do {
                abs.pop();
                rel.splice(0, 1);
            } while (rel[0] === "..");
        } else if (rel[0] === ".") {
            rel.splice(0, 1);
        }
        b = rel.length;
        if (b < 0) {
            do {
                rel[a] = apps.sanitizef(rel[a]);
                a      = a + 1;
            } while (a < b);
        }
        return abs.join(node.path.sep) + node.path.sep + rel.join(node.path.sep);
    };
    apps.remove      = function biddle_remove(filepath, callback) {
        var numb    = {
                dirs: 0,
                file: 0,
                othr: 0,
                size: 0,
                symb: 0
            },
            dirs    = {},
            util    = {},
            verbose = true;
        if (data.command === "copy") {
            verbose = false;
        }
        util.complete = function biddle_remove_complete() {
            var out = ["biddle removed "];
            if (data.command === "remove") {
                out.push(text.red);
                out.push(text.bold);
                out.push(numb.dirs);
                out.push(text.none);
                out.push(" director");
                if (numb.dirs === 1) {
                    out.push("y, ");
                } else {
                    out.push("ies, ");
                }
                out.push(text.red);
                out.push(text.bold);
                out.push(numb.file);
                out.push(text.none);
                out.push(" file");
                if (numb.dirs !== 1) {
                    out.push("s");
                }
                out.push(", ");
                out.push(text.red);
                out.push(text.bold);
                out.push(numb.symb);
                out.push(text.none);
                out.push(" symbolic link");
                if (numb.symb !== 1) {
                    out.push("s");
                }
                out.push(", and ");
                out.push(text.red);
                out.push(text.bold);
                out.push(numb.symb);
                out.push(text.none);
                out.push(" other type");
                if (numb.symb !== 1) {
                    out.push("s");
                }
                out.push(" at ");
                out.push(text.red);
                out.push(text.bold);
                out.push(apps.commas(numb.size));
                out.push(text.none);
                out.push(" bytes.");
                console.log(out.join(""));
                console.log("Removed " + text.cyan + filepath + text.nocolor);
            }
            callback();
        };
        util.destroy  = function biddle_remove_destroy(item, dir) {
            node
                .fs
                .unlink(item, function biddle_remove_destroy_callback(er) {
                    if (verbose === true && er !== null && er.toString("no such file or directory") < 0) {
                        return apps.errout({error: er, name: "biddle_remove_delete_callback"});
                    }
                    if (item === dir) {
                        util.complete();
                    }
                    dirs[dir] = dirs[dir] - 1;
                    if (dirs[dir] < 1) {
                        util.rmdir(dir);
                    }
                });
        };
        util.readdir  = function biddle_remove_readdir(item) {
            node
                .fs
                .readdir(item, function biddle_remove_readdir_callback(er, files) {
                    if (verbose === true && er !== null && er.toString("no such file or directory") < 0) {
                        return apps.errout({error: er, name: "biddle_remove_readdir_callback"});
                    }
                    dirs[item] = 0;
                    if (files === undefined || files.length < 1) {
                        util.rmdir(item);
                    } else {
                        files.forEach(function biddle_remove_readdir_callback_each(value) {
                            dirs[item] = dirs[item] + 1;
                            util.stat(item + node.path.sep + value, item);
                        });
                    }
                });
        };
        util.rmdir    = function biddle_remove_rmdir(item) {
            node
                .fs
                .rmdir(item, function biddle_remove_delete_callback_rmdir(er) {
                    var dirlist = item.split(node.path.sep),
                        dir     = "";
                    if (er !== null && er.toString().indexOf("resource busy or locked") > 0) {
                        return setTimeout(function biddle_remove_rmdir_delay() {
                            biddle_remove_rmdir(item);
                        }, 1000);
                    }
                    if (verbose === true && er !== null && er.toString("no such file or directory") < 0) {
                        return apps.errout({error: er, name: "biddle_remove_rmdir_callback"});
                    }
                    delete dirs[item];
                    if (Object.keys(dirs).length < 1) {
                        util.complete();
                    } else {
                        dirlist.pop();
                        dir       = dirlist.join(node.path.sep);
                        dirs[dir] = dirs[dir] - 1;
                        if (dirs[dir] < 1) {
                            biddle_remove_rmdir(dir);
                        }
                    }
                });
        };
        util.stat     = function biddle_remove_stat(item, dir) {
            node
                .fs
                .lstat(item, function biddle_remove_stat_callback(er, stats) {
                    if (verbose === true && er !== null && er.toString().indexOf("no such file or directory") < 0) {
                        return apps.errout({error: er, name: "biddle_remove_stat_callback"});
                    }
                    if (stats !== undefined && stats.isFile !== undefined) {
                        if (stats.isDirectory() === true) {
                            numb.dirs = numb.dirs + 1;
                            util.readdir(item);
                        } else {
                            if (stats.isFile() === true) {
                                numb.file = numb.file + 1;
                                numb.size = numb.size + stats.size;
                            } else if (stats.isSymbolicLink() === true) {
                                numb.symb = numb.symb + 1;
                            } else {
                                numb.othr = numb.othr + 1;
                            }
                            util.destroy(item, dir);
                        }
                    } else if (item === dir) {
                        if (data.command === "remove") {
                            console.log("Item not found - " + text.cyan + filepath + text.nocolor);
                        }
                        callback();
                    }
                });
        };
        util.stat(filepath, filepath);
    };
    apps.sanitizef   = function biddle_sanitizef(filePath) {
        var paths    = filePath.split(node.path.sep),
            fileName = paths.pop();
        paths.push(fileName.replace(/\+|<|>|:|"|\||\?|\*|%|\s/g, ""));
        return paths.join("");
    };
    apps.status      = function biddle_status(app, forceInternal, callback) {
        var list       = [],
            versions   = {},
            a          = 0,
            b          = 0,
            len        = 0,
            single     = false,
            appdata    = (forceInternal === true)
                ? data.installed.internal
                : data.installed,
            addy       = "",
            compare    = function biddle_status_compare() {
                var keys     = Object.keys(versions),
                    klen     = keys.length,
                    k        = 0,
                    currents = [],
                    outs     = [];
                keys.sort();
                do {
                    if (appdata[keys[k]].version === versions[keys[k]]) {
                        currents.push(
                            "* " + keys[k] + " matches published version " + text.bold + text.green + versions[keys[k]] +
                            text.none
                        );
                    } else if (data.command === "update") {
                        outs.push(
                            "* Updating " + text.yellow + keys[k] + text.nocolor + " from version " + text.bold + text.cyan + appdata[keys[k]].version +
                            text.none + " to newer version " + text.bold + text.green + versions[keys[k]] +
                            text.none
                        );
                    } else {
                        outs.push(
                            "* " + keys[k] + " is installed at version " + text.bold + text.cyan + appdata[keys[k]].version +
                            text.none + " but published version is " + text.bold + text.red + versions[keys[k]] +
                            text.none
                        );
                    }
                    k = k + 1;
                } while (k < klen);
                klen = outs.length;
                if (klen > 0) {
                    if (data.command === "status") {
                        if (single === false) {
                            console.log("");
                            if (currents.length < 1) {
                                console.log(
                                    text.underline + text.red + "All Applications Outdated:" + text.none
                                );
                            } else {
                                console.log(text.underline + "Outdated Applications:" + text.normal);
                            }
                        }
                        console.log("");
                    }
                    k = 0;
                    do {
                        callback(outs[k]);
                        k = k + 1;
                    } while (k < klen);
                }
                klen = currents.length;
                if (klen > 0) {
                    if (data.command === "status") {
                        if (single === false) {
                            console.log("");
                            if (outs.length < 1) {
                                console.log(
                                    text.underline + text.green + "All Applications Are Current:" + text.none
                                );
                            } else {
                                console.log(text.underline + "Current Applications:" + text.normal);
                            }
                        }
                        console.log("");
                    }
                    k = 0;
                    do {
                        callback(currents[k]);
                        k = k + 1;
                    } while (k < klen);
                }
            },
            getversion = function biddle_status_get(filedata, filepath) {
                var name = function biddle_status_name(pub) {
                    var dirs = [];
                    if (data.protocoltest.test(pub) === true) {
                        dirs = pub.split("/");
                        dirs.pop();
                        return dirs.pop();
                    }
                    dirs = pub.split(node.path.sep);
                    dirs.pop();
                    if (dirs[dirs.length - 1] === "") {
                        dirs.pop();
                    }
                    return dirs.pop();
                };
                versions[name(filepath)] = filedata;
                b                        = b + 1;
                if (b === len) {
                    compare();
                }
            };
        if (app === undefined || app === "") {
            list = Object.keys(appdata);
            if (data.childtest === false) {
                list.push("biddle");
            }
            list.sort();
        } else if (appdata[app] !== undefined) {
            list   = [app];
            single = true;
        } else if (app !== undefined) {
            return apps.errout({
                error: app + " is not a biddle installed application.",
                name : "biddle_status"
            });
        }
        len = list.length;
        do {
            if (list[a] === "biddle") {
                apps.get(
                    "http://prettydiff.com/downloads/biddle/latest.txt",
                    "latest.txt",
                    getversion
                );
            } else {
                addy = appdata[list[a]].published;
                if (data.protocoltest.test(addy) === true) {
                    apps.get(addy + "/latest.txt", "latest.txt", getversion);
                } else {
                    apps.get(addy + node.path.sep + "latest.txt", "latest.txt", getversion);
                }
            }
            a = a + 1;
        } while (a < len);
    };
    apps.test        = function biddle_test() {
        var loc     = "",
            test    = "",
            file    = (data.input[2] === undefined)
                ? data.abspath + "package.json"
                : apps.relToAbs(
                    data.input[2].replace(/(\/|\\)$/, "") + node.path.sep + "package.json",
                    data.cwd
                ),
            name    = data.input[2],
            spawn   = function biddle_test_spawn() {
                var spwn = require("child_process").spawn,
                    args = test.split(" "),
                    cmd  = args[0],
                    exec = function biddle_test_spawn_init() {
                        return true;
                    };
                args.splice(0, 1);
                exec = spwn(cmd, args, {
                    cwd  : loc,
                    stdio: "inherit"
                });
                if (exec.stdout !== null) {
                    exec
                        .stdout
                        .on("data", function biddle_test_spawn_data(data) {
                            console.log(data);
                        });
                }
                if (exec.stderr !== null) {
                    exec
                        .stderr
                        .on("data", function biddle_test_spawn_stderr(data) {
                            console.log(data);
                        });
                }
                exec.on("error", function biddle_test_spawn_error(data) {
                    apps.errout({error: data, name: "biddle_test_spawn_error"});
                });
                exec.on("close", function biddle_test_spawn_close() {
                    console.log(
                        "biddle has completed test for " + name + "."
                    );
                });
            },
            foreign = function biddle_test_foreign() {
                loc  = name;
                test = data.packjson.test;
                if (test === undefined) {
                    return apps.errout({
                        error: name + " does not have a test property in its package.json",
                        name : "biddle_test_foreign"
                    });
                }
                spawn();
            };
        if (name === undefined || name === "" || name === "biddle") {
            data.input[2] = "biddle";
            return apps.testBiddle();
        }
        if (name.indexOf(node.path.sep) < 0) {
            if (data.installed[name] === undefined) {
                return apps.errout({
                    error: name + " is not a biddle installed appliation. For local directories try ." +
                            node.path.sep + name,
                    name : "biddle_test"
                });
            }
            loc  = data
                .installed[name]
                .location;
            test = data
                .installed[name]
                .test;
            spawn();
        } else {
            apps.getpjson(file, foreign);
        }
    };
    apps.testBiddle  = function biddle_testBiddle() {
        var startTime = Date.now(),
            order     = [
                "moduleInstall",
                "lint",
                "hashString",
                "hashFile",
                "copy",
                "remove",
                "markdown",
                "get",
                "zip",
                "unzip",
                "publishA",
                "publishB",
                "install",
                "listStatus",
                "republish",
                "update",
                "uninstall",
                "unpublishLatest",
                "unpublishAll",
                "unpublishB"
            ],
            phasenumb = 0,
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
            //Windows child shell does not see a user modified path variable
            childcmd  = (data.platform === "win32")
                ? "node " + data.abspath + "biddle "
                : (data.abspath === process.cwd() + node.path.sep)
                    ? "node " + data.abspath + "biddle "
                    : "biddle ",
            mods      = {},
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
                                    a = a - 1;
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
                    return finalMem + " of memory consumed" + hourString + minuteString +
                            secondString + "total time";
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
                return text.cyan + "[" + hourString + ":" + minuteString + ":" +
                        secondString + "]" + text.nocolor + " ";
            },
            diffFiles = function biddle_test_diffFiles(
                sampleName,
                sampleSource,
                sampleDiff
            ) {
                var aa     = 0,
                    pdlen  = 0,
                    report = [],
                    plural = "s";
                options.mode    = "diff";
                options.source  = sampleSource.replace(/\u001b/g, "\\u001b");
                options.diff    = sampleDiff.replace(/\u001b/g, "\\u001b");
                options.diffcli = true;
                options.context = 2;
                options.lang    = "text";
                report          = mods.prettydiff(options);
                pdlen           = report.length;
                if (pdlen === 1) {
                    plural = "";
                } else if (pdlen < 1) {
                    console.log("");
                    if (sampleSource.length < 1) {
                        console.log(
                            text.red + "An empty source value passed into test diff operation." + text.nocolor
                        );
                    }
                    if (sampleDiff.length < 1) {
                        console.log(
                            text.red + "An empty diff value passed into test diff operation." + text.nocolor
                        );
                    }
                    return apps.errout({
                        error : text.red + "bad diff, output is 0 characters long" + text.nocolor,
                        name  : sampleName,
                        stdout: "",
                        time  : humantime(true)
                    });
                }
                console.log(
                    text.red + "Test Failure with Comparison" + text.nocolor
                );
                console.log(text.underline + "First Sample" + text.normal);
                console.log(sampleSource);
                console.log("");
                console.log(text.underline + "Second Sample" + text.normal);
                console.log(sampleDiff);
                console.log("");
                console.log(text.underline + "Comparison" + text.normal);
                // report indexes from diffcli feature of diffview.js
                // 0. source line number
                // 1. source code line
                // 2. diff line number
                // 3. diff code line
                // 4. change
                // 5. index of options.context (not parallel) 6 - total count of differences
                for (aa = 0; aa < pdlen; aa = aa + 1) {
                    console.log(report[aa]);
                }
                console.log("");
                console.log(
                    global.prettydiff.meta.difftotal + text.cyan + " difference" + plural + " count" +
                    "ed." + text.nocolor
                );
                console.log("");
                apps.errout({
                    error : "Pretty Diff " + text.red + "failed" + text.nocolor + " in function: " + text.cyan +
                            sampleName + text.nocolor,
                    name  : sampleName,
                    stdout: "",
                    time  : humantime(true)
                });
            },
            phases    = {},
            next      = function biddle_test_next() {
                console.log("");
                if (order.length < 1) {
                    return apps.remove(testpath, function biddle_test_next_rmdir() {
                        console.log("All tasks complete... Exiting clean!");
                        console.log(humantime(true));
                        process.exit(0);
                    });
                }
                if (order[0] === "moduleInstall") {
                    data.internal = true;
                } else {
                    data.internal = false;
                }
                phases[order[0]]();
                order.splice(0, 1);
            };
        phases.copy            = function biddle_test_copy() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Copy tests");
            node.child(
                childcmd + "copy " + data.abspath + "test" + node.path.sep + "biddletesta" +
                        node.path.sep + "biddletesta.js " + testpath + " childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_copy_child(er, stdout, stder) {
                    var copytest = "biddle copied " + text.green + text.bold + "0" + text.none + " " +
                                "directories, " + text.green + text.bold + "1" + text.none + " file, and " +
                                text.green + text.bold + "0" + text.none + " symbolic links at " + text.green +
                                text.bold + "23,177" + text.none + " bytes.\nCopied " + text.cyan + data.abspath +
                                "test" + node.path.sep + "biddletesta" + node.path.sep + "biddletesta.js" +
                                text.nocolor + " to " + text.green + data.abspath + "unittest" + text.nocolor,
                        copyfile = data.abspath + "unittest" + node.path.sep + "biddletesta.js";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_copy_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_copy_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout
                        .replace(/(\s+)$/, "")
                        .replace(/\r\n/g, "\n");
                    if (stdout !== copytest) {
                        return diffFiles("biddle_test_copy_child", stdout, copytest);
                    }
                    node
                        .fs
                        .stat(copyfile, function biddle_test_copy_child_stat(ers, stats) {
                            if (ers !== null) {
                                return apps.errout(
                                    {error: ers, name: "biddle_test_copy_child_stat", stdout: stdout, time: humantime(true)}
                                );
                            }
                            if (stats === undefined || stats.isFile() === false) {
                                return apps.errout({
                                    error : "copy failed as " + copyfile + " is not present",
                                    name  : "biddle_test_copy_child_stat",
                                    stdout: stdout,
                                    time  : humantime(true)
                                });
                            }
                            console.log(
                                humantime(false) + " " + text.green + "copy test passed." + text.nocolor
                            );
                            next();
                        });
                }
            );
        };
        phases.get             = function biddle_test_get() {
            var flag = {
                binary: false,
                text  : false
            };
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Get tests");
            node.child(
                childcmd + "get https://www.google.com/images/branding/googlelogo/2x/googlelogo" +
                        "_color_272x92dp.png " + data.abspath + "unittest childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_get_childText(er, stdout, stder) {
                    var size     = "",
                        sizenumb = "",
                        sizetest = " \u001b[1m\u001b[32m13,504\u001b[39m\u001b[0m";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_get_childText", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_get_childText", stdout: stdout, time: humantime(true)}
                        );
                    }
                    size = stdout
                        .slice(stdout.indexOf("written at") + 10)
                        .replace(/(\s+)$/, "");
                    if ((/^(((File)|(\d{3}))\u0020)/).test(stdout) === false || stdout.indexOf("File\u0020") < 0 || stdout.indexOf(" 0 bytes") > 0 || size.replace(" bytes.", "").length < 4) {
                        return apps.errout({
                            error: "Unexpected output for test 'get':\r\n" + text.red + stdout + text.nocolor,
                            name : "biddle_test_get_childText",
                            time : humantime(true)
                        });
                    }
                    size     = size
                        .replace("\r\n", "\n")
                        .slice(0, size.indexOf("\n"));
                    sizenumb = size.replace(/\sbytes\.?/, "");
                    if (sizenumb !== sizetest) {
                        return diffFiles("biddle_test_get_childText", sizenumb, sizetest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "get text test passed." + text.nocolor +
                        " File written at" + size
                    );
                    flag.text = true;
                    if (flag.binary === true) {
                        next();
                    }
                }
            );
            node.child(
                childcmd + "get https://www.google.com/images/nav_logo242.png " + data.abspath +
                        "unittest childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_get_childBinary(er, stdout, stder) {
                    var size     = "",
                        sizenumb = "",
                        sizetest = " \u001b[1m\u001b[32m16,786\u001b[39m\u001b[0m";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_get_childBinary", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_get_childBinary", stdout: stdout, time: humantime(true)}
                        );
                    }
                    size = stdout
                        .slice(stdout.indexOf("written at") + 10)
                        .replace(/(\s+)$/, "");
                    if ((/^(((File)|(\d{3}))\u0020)/).test(stdout) === false || stdout.indexOf("File\u0020") < 0 || stdout.indexOf(" 0 bytes") > 0 || size.replace(" bytes.", "").length < 4) {
                        return apps.errout({
                            error: "Unexpected output for test 'get':\r\n" + text.red + stdout + text.nocolor,
                            name : "biddle_test_get_childBinary",
                            time : humantime(true)
                        });
                    }
                    size     = size
                        .replace("\r\n", "\n")
                        .slice(0, size.indexOf("\n"));
                    sizenumb = size.replace(/\sbytes\.?/, "");
                    if (sizenumb !== sizetest) {
                        return diffFiles("biddle_test_get_childBinary", sizenumb, sizetest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "get binary test passed." + text.nocolor +
                        " File written at" + size
                    );
                    flag.binary = true;
                    if (flag.text === true) {
                        next();
                    }
                }
            );
        };
        phases.hashFile        = function biddle_test_hashFile() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Hash file test");
            node.child(
                childcmd + "hash " + data.abspath + "LICENSE childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_hashFile_child(er, stdout, stder) {
                    var hashtest = "be09a71a2cda28b74e9dd206f46c1621aebe29182723f191d8109db4705ced014de469043c397f" +
                            "ee4d8f3483e396007ca739717af4bf43fed4c2e3dd14f3dc0c";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_hashFile_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_hashFile_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout.replace(/((\r?\n)+)$/, "");
                    if (stdout !== hashtest) {
                        return diffFiles("biddle_test_hashFile_child", stdout, hashtest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "hash file test passed." + text.nocolor
                    );
                    next();
                }
            );
        };
        phases.hashString      = function biddle_test_hashString() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Hash string test");
            node.child(
                childcmd + "hash string \"a moderately long string to hash and test in the unit" +
                        " tests of biddle\" childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_hashString_child(er, stdout, stder) {
                    var hashtest = "d18faf161f06a2362ba0efbc4a66f8e85f500b6281c848f6775c587362808e3f51ff557a20a544" +
                            "c41660f5d92fc018020c74b035d1eef4954828bc4125c2a11d";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_hashString_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_hashString_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout.replace(/((\r?\n)+)$/, "");
                    if (stdout !== hashtest) {
                        return diffFiles("biddle_test_hashString_child", stdout, hashtest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "hash string test passed." + text.nocolor
                    );
                    next();
                }
            );
        };
        phases.install         = function biddle_test_install() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Install tests");
            node.child(
                childcmd + "install " + data.abspath + "publications" + node.path.sep + "biddle" +
                        "testa" + node.path.sep + "biddletesta_latest.zip childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_install_child(er, stdout, stder) {
                    var instfile = data.abspath + "applications" + node.path.sep + "biddletesta" +
                            node.path.sep + "liba" + node.path.sep + "libab.txt";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_install_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_install_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stdout.indexOf(
                        "is missing the " + text.cyan + "http(s)" + text.nocolor + " scheme, treating a" +
                        "s a local path..."
                    ) < 7) {
                        return apps.errout({
                            error : "Expected output to contain: is missing the " + text.cyan + "http(s)" + text.nocolor +
                                    " scheme, treating as a local path...",
                            name  : "biddle_test_install_child",
                            stdout: stdout,
                            time  : humantime(true)
                        });
                    }
                    node
                        .fs
                        .stat(instfile, function biddle_test_install_child_stat(err, stats) {
                            if (err !== null) {
                                return apps.errout(
                                    {error: err, name: "biddle_test_install_child_stat", stdout: stdout, time: humantime(true)}
                                );
                            }
                            if (typeof stats !== "object" || stats.isFile() === false) {
                                return apps.errout({
                                    error : instfile + " does not exist.",
                                    name  : "biddle_test_install_child_stat",
                                    stdout: stdout,
                                    time  : humantime(true)
                                });
                            }
                            console.log(
                                humantime(false) + " " + text.green + "File from install is present:" + text.nocolor +
                                " " + instfile
                            );
                            node
                                .fs
                                .readFile(
                                    data.abspath + "installed.json",
                                    "utf8",
                                    function biddle_test_install_child_stat_readJSON(era, filedata) {
                                        var inst = {};
                                        if (era !== null && era !== undefined) {
                                            return apps.errout({
                                                error : instfile + " does not exist.",
                                                name  : "biddle_test_install_child_stat_readJSON",
                                                stdout: stdout,
                                                time  : humantime(true)
                                            });
                                        }
                                        inst = JSON.parse(filedata);
                                        if (inst.biddletesta === undefined) {
                                            return apps.errout(
                                                {error: "biddletesta is absent from installed.json", name: "biddle_test_install_child_stat_readJSON", stdout: stdout, time: humantime(true)}
                                            );
                                        }
                                        if ((/^(99\.99\.\d{4})$/).test(inst.biddletesta.version) === false) {
                                            return apps.errout({
                                                error : "Expected biddletesta.version of installed.json to be equivalent to '99\\.99\\." +
                                                        "\\d{4}'.",
                                                name  : "biddle_test_install_child_stat_readJSON",
                                                stdout: stdout,
                                                time  : humantime(true)
                                            });
                                        }
                                        console.log(
                                            humantime(false) + " " + text.green + "installed.json contains biddletesta." +
                                            text.nocolor
                                        );
                                        console.log(
                                            humantime(false) + " " + text.green + "install test passed." + text.nocolor
                                        );
                                        next();
                                    }
                                );
                        });
                }
            );
        };
        phases.lint            = function biddle_test_lint() {
            var ignoreDirectory = [
                    ".git",
                    "applications",
                    "bin",
                    "dependencies",
                    "downloads",
                    "internal",
                    "publications",
                    "unittest"
                ],
                files           = [],
                lintrun         = function biddle_test_lint_lintrun() {
                    var len    = files.length,
                        a      = 0,
                        failed = false,
                        lintit = function biddle_test_lint_lintrun_lintit() {
                            var result = {},
                                ecount = 0,
                                good   = function biddle_tst_lint_lintrun_lintit_good() {
                                    console.log(
                                        humantime(false) + text.green + "Lint is good for file " + (
                                            a + 1
                                        ) + ":" + text.nocolor + " " + files[a][0]
                                    );
                                    if (a === len - 1) {
                                        console.log(text.green + "Lint operation complete!" + text.nocolor);
                                        next();
                                    }
                                },
                                report = function biddle_test_lint_lintrun_lintit_report(warning) {
                                    //start with an exclusion list.  There are some warnings that I don't care about
                                    if (warning === null) {
                                        return good();
                                    }
                                    if (warning.message.indexOf("Unexpected dangling '_'") === 0) {
                                        return good();
                                    }
                                    if ((/Bad\u0020property\u0020name\u0020'\w+_'\./).test(warning.message) === true) {
                                        return good();
                                    }
                                    if (warning.message.indexOf("/*global*/ requires") === 0) {
                                        return good();
                                    }
                                    failed = true;
                                    if (ecount === 0) {
                                        console.log(text.red + "JSLint errors on" + text.nocolor + " " + files[a][0]);
                                        console.log("");
                                    }
                                    ecount = ecount + 1;
                                    console.log("On line " + warning.line + " at column: " + warning.column);
                                    console.log(warning.message);
                                    console.log("");
                                    return apps.errout({
                                        error: text.red + "Lint fail" + text.nocolor + " :(",
                                        name : "biddle_test_lint_lintrun_lintit",
                                        time : humantime(true)
                                    });
                                };
                            options.source = files[a][1];
                            result         = mods.jslint(mods.prettydiff(options), {"for": true});
                            if (result.ok === true) {
                                good();
                            } else {
                                result
                                    .warnings
                                    .forEach(report);
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
                    do {
                        lintit();
                        if (failed === true) {
                            break;
                        }
                        a = a + 1;
                    } while (a < len);
                };
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Lint tests");
            console.log(
                "** Note that line numbers of error messaging reflects beautified code line."
            );
            ignoreDirectory.forEach(
                function biddle_test_lint_absignore(value, index, array) {
                    array[index] = data.abspath + value;
                }
            );
            (function biddle_test_lint_getFiles() {
                var enddirs    = 1,
                    endfiles   = 0,
                    endread    = 0,
                    startdirs  = 1,
                    startfiles = 0,
                    startread  = 0,
                    idLen      = ignoreDirectory.length,
                    readFile   = function biddle_test_lint_getFiles_readFile(filePath) {
                        node
                            .fs
                            .readFile(
                                filePath,
                                "utf8",
                                function biddle_test_lint_getFiles_readFile_callback(err, data) {
                                    if (err !== null && err !== undefined) {
                                        return apps.errout(
                                            {error: err, name: "biddle_test_lint_getFiles_readFile_callback", time: humantime(false)}
                                        );
                                    }
                                    files.push([filePath, data]);
                                    endread = endread + 1;
                                    if (endread === startread && endfiles === startfiles && enddirs === startdirs) {
                                        lintrun();
                                    }
                                }
                            );
                    },
                    readDir    = function biddle_test_lint_getFiles_readDir(filepath) {
                        node
                            .fs
                            .readdir(
                                filepath,
                                function biddle_test_lint_getFiles_readDir_callback(erra, list) {
                                    var fileEval = function biddle_test_lint_getFiles_readDir_callback_fileEval(
                                        val
                                    ) {
                                        var filename = (filepath.charAt(filepath.length - 1) === node.path.sep)
                                            ? filepath + val
                                            : filepath + node.path.sep + val;
                                        node
                                            .fs
                                            .stat(
                                                filename,
                                                function biddle_test_lint_getFiles_readDir_callback_fileEval_stat(errb, stat) {
                                                    var a = 0;
                                                    endfiles = endfiles + 1;
                                                    if (errb !== null) {
                                                        return apps.errout(
                                                            {error: errb, name: "biddle_test_lint_getFiles_readDir_callback_fileEval_stat", time: humantime(false)}
                                                        );
                                                    }
                                                    if (stat.isFile() === true && (/(\.js)$/).test(filename) === true) {
                                                        startread = startread + 1;
                                                        readFile(filename);
                                                    }
                                                    if (stat.isDirectory() === true) {
                                                        startdirs = startdirs + 1;
                                                        do {
                                                            if (filename === ignoreDirectory[a]) {
                                                                enddirs = enddirs + 1;
                                                                if (endread === startread && endfiles === startfiles && enddirs === startdirs) {
                                                                    lintrun();
                                                                }
                                                                return;
                                                            }
                                                            a = a + 1;
                                                        } while (a < idLen);
                                                        enddirs = enddirs + 1;
                                                        biddle_test_lint_getFiles_readDir(filename);
                                                    }
                                                }
                                            );
                                    };
                                    if (erra !== null) {
                                        return apps.errout({
                                            error: "Error reading path: " + filepath + "\n" + erra,
                                            name : "biddle_test_lint_getFiles_readDir_callback",
                                            time : humantime(false)
                                        });
                                    }
                                    startfiles = startfiles + list.length;
                                    list.forEach(fileEval);
                                }
                            );
                    };
                readDir(data.abspath);
            }());
        };
        phases.listStatus      = function biddle_test_listStatus() {
            var listcmds  = [
                    "install " + data.abspath + "unittest" + node.path.sep + "publications" +
                            node.path.sep + "biddletestb" + node.path.sep + "biddletestb_latest.zip",
                    "list",
                    "list published",
                    "list installed",
                    "status",
                    "status biddletesta",
                    "status biddletesta",
                    "status",
                    "uninstall biddletestb"
                ],
                changed   = false,
                listChild = function biddle_test_listStatus_childWrapper() {
                    node.child(childcmd + listcmds[0] + " childtest", {
                        cwd: data.abspath
                    }, function biddle_test_listStatus_childWrapper_child(er, stdout, stder) {
                        var listout = "\n" + text.underline + text.cyan + "installed applications:" +
                                    text.none + "\n\n* " + text.cyan + "biddletesta" + text.nocolor + " - 99.99.xxx" +
                                    "x - " + data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep +
                                    "\n* " + text.cyan + "biddletestb" + text.nocolor + " - 98.98.1234 - " + data.abspath +
                                    "applications" + node.path.sep + "biddletestb" + node.path.sep + "\n\n" +
                                    text.underline + text.cyan + "published applications:" + text.none + "\n\n* " +
                                    text.cyan + "biddletesta" + text.nocolor + " - 99.99.xxxx - " + data.abspath +
                                    "publications" + node.path.sep + "biddletesta" + node.path.sep + "\n* " +
                                    text.cyan + "biddletestb" + text.nocolor + " - 98.98.1234 - " + data.abspath +
                                    "unittest" + node.path.sep + "publications" + node.path.sep + "biddletestb" +
                                    node.path.sep,
                            listpub = "\n" + text.underline + text.cyan + "published applications:" +
                                    text.none + "\n\n* " + text.cyan + "biddletesta" + text.nocolor + " - 99.99.xxx" +
                                    "x - " + data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep +
                                    "\n* " + text.cyan + "biddletestb" + text.nocolor + " - 98.98.1234 - " + data.abspath +
                                    "unittest" + node.path.sep + "publications" + node.path.sep + "biddletestb" +
                                    node.path.sep,
                            listist = "\n" + text.underline + text.cyan + "installed applications:" +
                                    text.none + "\n\n* " + text.cyan + "biddletesta" + text.nocolor + " - 99.99.xxx" +
                                    "x - " + data.abspath + "applications" + node.path.sep + "biddletesta" + node.path.sep +
                                    "\n* " + text.cyan + "biddletestb" + text.nocolor + " - 98.98.1234 - " + data.abspath +
                                    "applications" + node.path.sep + "biddletestb" + node.path.sep,
                            statout = "\n" + text.underline + text.green +
                                    "all applications are current:" + text.none + "\n\n* biddletesta matches publis" +
                                    "hed version " + text.bold + text.green + "99.99.xxxx" + text.none + "\n* biddletestb mat" +
                                    "ches published version " + text.bold + text.green + "98.98.1234" + text.none,
                            statpba = "\n* biddletesta matches published version " + text.bold + text.green +
                                    "99.99.xxxx" + text.none,
                            statpbb = "\n" + text.underline + "outdated applications:" + text.normal + "\n" +
                                    "\n* biddletesta is installed at version " + text.bold + text.cyan +
                                    "99.99.xxxx" + text.none + " but published version is " + text.bold + text.red + "11.22.67" +
                                    "89" + text.none + "\n\n" + text.underline + "current applications:" +
                                    text.normal + "\n\n* biddletestb matches published version " + text.bold + text.green + "98." +
                                    "98.1234" + text.none,
                            statpbc = "\n* biddletesta is installed at version " + text.bold + text.cyan + "99.99.xxxx" +
                                    text.none + " but published version is " + text.bold + text.red + "11.22.6789" + text.none;
                        if (er !== null) {
                            return apps.errout({
                                error : er,
                                name  : "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                        listcmds[0] + ")",
                                stdout: stdout,
                                time  : humantime(true)
                            });
                        }
                        if (stder !== null && stder !== "") {
                            return apps.errout({
                                error : stder,
                                name  : "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                        listcmds[0] + ")",
                                stdout: stdout,
                                time  : humantime(true)
                            });
                        }
                        stdout = stdout
                            .toLowerCase()
                            .replace(/(\s+)$/, "")
                            .replace(/\r\n/g, "\n")
                            .replace(/99\.99\.\d{4}/g, "99.99.xxxx");
                        if (changed === false && listcmds[0] === "list") {
                            if (stdout !== listout) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    listout
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "mlist output passed." + text.nocolor
                            );
                        }
                        if (changed === false && listcmds[0] === "list published") {
                            if (stdout !== listpub) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    listpub
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "list published output passed." + text.nocolor
                            );
                        }
                        if (changed === false && listcmds[0] === "list installed") {
                            if (stdout !== listist) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    listist
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "list installed output passed." + text.nocolor
                            );
                        }
                        if (changed === false && listcmds[0] === "status") {
                            if (stdout !== statout) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    statout
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "status output passed." + text.nocolor
                            );
                        }
                        if (changed === true && listcmds[0] === "status") {
                            if (stdout !== statpbb) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    statpbb
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "status outdated output passed." + text.nocolor
                            );
                        }
                        if (changed === true && listcmds[0] === "status biddletesta") {
                            if (stdout !== statpbc) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    statpbc
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "status outdated biddletesta output passe" +
                                "d." + text.nocolor
                            );
                        }
                        if (changed === false && listcmds[0] === "status biddletesta") {
                            if (stdout !== statpba) {
                                return diffFiles(
                                    "biddle_test_listStatus_childWrapper_child(changed: " + changed + ", " +
                                            listcmds[0] + ")",
                                    stdout,
                                    statpba
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "status biddletesta output passed." +
                                text.nocolor
                            );
                            apps.writeFile(
                                "11.22.6789",
                                data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep +
                                        "latest.txt",
                                function biddle_test_listStatus_childWrapper_child_changeVersion() {
                                    changed = true;
                                    listcmds.splice(0, 1);
                                }
                            );
                        } else {
                            listcmds.splice(0, 1);
                        }
                        if (listcmds.length > 0) {
                            biddle_test_listStatus_childWrapper();
                        } else {
                            console.log(
                                humantime(false) + " " + text.green + "list and status tests passed." + text.nocolor
                            );
                            next();
                        }
                    });
                };
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". List and status tests");
            listChild();
        };
        phases.markdown        = function biddle_test_markdown() {
            var flag = {
                "120": false,
                "60" : false,
                "80" : false
            };
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Markdown tests");
            node.child(
                childcmd + "markdown " + data.abspath + "test" + node.path.sep +
                        "biddletesta" + node.path.sep + "READMEa.md 60 childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_markdown_60(er, stdout, stder) {
                    var markdowntest = "\n" + text.underline + text.bold + text.red + "test README" + text.none + "\ns" +
                                "ome dummy subtext\n\n" + text.underline + text.bold + text.red + "heading by u" +
                                "nderline equals" + text.none + "\n\n" + text.underline + text.bold + text.cyan +
                                "heading by underline dashes" + text.none + "\n\n  ===\n\n" + text.underline +
                                text.bold + text.cyan + "First Secondary Heading" + text.none + "\n    | a big " +
                                "block quote lives here. This is where I am\n    | going to experience with wra" +
                                "pping a block quote a bit\n    | differently from other content.  I need enoug" +
                                "h text\n    | in this quote to wrap a couple of times, so I will\n    | contin" +
                                "ue adding some nonsense and as long as it\n    | takes to ensure I have a full" +
                                "y qualified test.\n    | New line in a block quote\n    | More block\n\n  This" +
                                " is a regular paragraph that needs to be long\n  enough to wrap a couple times" +
                                ".  This text will be unique\n  from the text in the block quote because unique" +
                                "ness\n  saves time when debugging test failures.  I am now\n  writing a bunch " +
                                "of wrapping paragraph gibberish, such as\n  f324fasdaowkefsdva.  That one isn'" +
                                "t even a word.  It\n  isn't cool if it doesn't contain a hyperlink,\n  (" +
                                text.cyan + "http://tonowhwere.nothing" + text.nocolor +
                                "), in some text.\n\n  " + text.bold + text.red + "*" + text.none + " list item" +
                                " 1 these also need to wrap like a\n    paragraph. So blah blah wrapping some m" +
                                "adness into a\n    list item right gosh darn here and let's see what\n    shak" +
                                "es out of the coolness.\n  " + text.bold + text.red + "*" + text.none + " list" +
                                " item 2 these also need to wrap like a\n    paragraph. So blah blah wrapping s" +
                                "ome madness into a\n    list item right gosh darn here and let's see what\n   " +
                                " shakes out of the coolness.\n    " + text.bold + text.red + "-" + text.none +
                                " sublist item 1 these also need to wrap\n      like a paragraph. So blah blah " +
                                "wrapping some madness\n      into a list item right gosh darn here and let's\n" +
                                "      see what shakes out of the coolness.\n    " + text.bold + text.red +
                                "-" + text.none + " sublist item 2 these also need to wrap\n      like a paragr" +
                                "aph. So blah blah wrapping some madness\n      into a list item right gosh dar" +
                                "n here and let's\n      see what shakes out of the coolness.\n      " + text.bold +
                                text.red + "*" + text.none + " subsublist item 1 these also need to\n        wr" +
                                "ap like a paragraph. So blah blah wrapping some\n        madness into a list i" +
                                "tem right gosh darn here\n        and let's see what shakes out of the coolnes" +
                                "s.\n      " + text.bold + text.red + "*" + text.none + " subsublist item 2 the" +
                                "se also need to\n        wrap like a paragraph. So blah blah wrapping some\n  " +
                                "      madness into a list item right gosh darn here\n        and let's see wha" +
                                "t shakes out of the coolness.\n  " + text.bold + text.red + "*" + text.none +
                                " list item 3 these also need to wrap like a\n    paragraph. So blah blah wrapp" +
                                "ing some madness into a\n    list item right gosh darn here and let's see what" +
                                "\n    shakes out of the coolness.\n    " + text.bold + text.red + "-" + text.none +
                                " boo these also need to wrap like a\n      paragraph. So blah blah wrapping so" +
                                "me madness into a\n      list item right gosh darn here and let's see what\n  " +
                                "    shakes out of the coolness.\n\n  " + text.underline + text.bold + text.green +
                                "First Tertiary Heading #####" + text.none + "\n    This text should be extra i" +
                                "ndented.\n\n    " + text.bold + text.red + "*" + text.none + " list item 1\n  " +
                                "  " + text.bold + text.red + "*" + text.none + " list item 2\n      " + text.bold +
                                text.red + "-" + text.none + " sublist item 1\n      " + text.bold + text.red +
                                "-" + text.none + " sublist item 2\n        " + text.bold + text.red + "*" +
                                text.none + " subsublist item 1\n        " + text.bold + text.red + "*" +
                                text.none + " subsublist item 2\n    " + text.bold + text.red + "*" + text.none +
                                " list item 3\n      " + text.bold + text.red + "-" + text.none +
                                " boo\n\n    " + text.underline + text.bold + text.yellow + "Gettin Deep with t" +
                                "he Headings" + text.none + "\n\n        | a big block quote lives here. This i" +
                                "s where I am\n        | going to experience with wrapping a block quote\n     " +
                                "   | a bit differently from other content.  I need\n        | enough text in t" +
                                "his quote to wrap a couple of\n        | times, so I will continue adding some" +
                                " nonsense\n        | and a long a t takes to ensure I have a fully\n        | " +
                                "qualified test.\n        | New line in a block quote\n        | More block and" +
                                " not a heading\n        | --------------------------------------------------\n" +
                                "\n        | a a a a a a a a a a a a a a a a a a a a a a a a a\n        | a a a" +
                                " a a a a a a a a a a a a a a a a a a a a\n        | a a a a a a a a a a a a a " +
                                "a a a a a a a a a a a\n\n        | aa a a a a a a a a a a a a a a a a a a a a " +
                                "a a a\n        | a a a a a a a a a a a a a a a a a a a a a a a a\n        | a " +
                                "a a a a a a a a a a a a a a a a a a a a a a a\n\n      Horizontal Rule with *" +
                                "\n************************************************************\n\n      Horizo" +
                                "ntal Rule with - (requires an empty line between\n      it and text)\n\n------" +
                                "------------------------------------------------------\n\n      Horizontal Rul" +
                                "e with _\n____________________________________________________________\n\n    " +
                                "  Images get converted to their alt text description.\n\n      This is a regul" +
                                "ar paragraph that needs to be long\n      enough to wrap a couple times.  This" +
                                " text will be\n      unique from the text in the block quote because\n      un" +
                                "iqueness saves time when debugging test failures.  I\n      am now writing a b" +
                                "unch of wrapping paragraph\n      gibberish, such as f324fasdaowkefsdva.  That" +
                                " one\n      isn't even a word.\n\n      " + text.bold + text.red + "*" +
                                text.none + " list item 1 these also need to wrap like\n        a paragraph. So" +
                                " blah blah wrapping some\n        madness into a list item right gosh darn her" +
                                "e and\n        let's see what shakes out of the coolness.\n      " + text.bold +
                                text.red + "*" + text.none + " list item 2 these also need to wrap like\n      " +
                                "  a paragraph. So blah blah wrapping some\n        madness into a list item ri" +
                                "ght gosh darn here and\n        let's see what shakes out of the coolness.\n  " +
                                "      " + text.bold + text.red + "-" + text.none + " sublist item 1 these also" +
                                " need to wrap\n          like a paragraph. So blah blah wrapping some\n       " +
                                "   madness into a list item right gosh darn\n          here and let's see what" +
                                " shakes out of the\n          coolness.\n        " + text.bold + text.red +
                                "-" + text.none + " sublist item 2 these also need to wrap\n          like a pa" +
                                "ragraph. So blah blah wrapping some\n          madness into a list item right " +
                                "gosh darn\n          here and let's see what shakes out of the\n          cool" +
                                "ness.\n          " + text.bold + text.red + "*" + text.none + " subsublist ite" +
                                "m 1 these also need to\n            wrap like a paragraph. So blah blah\n     " +
                                "       wrapping some madness into a list item right gosh\n            darn her" +
                                "e and let's see what shakes out of\n            the coolness.\n          " +
                                text.bold + text.red + "*" + text.none + " subsublist item 2 these also need to" +
                                "\n            wrap like a paragraph. So blah blah\n            wrapping some m" +
                                "adness into a list item right gosh\n            darn here and let's see what s" +
                                "hakes out of\n            the coolness.\n      " + text.bold + text.red + "*" +
                                text.none + " list item 3 these also need to wrap like\n        a paragraph. So" +
                                " blah blah wrapping some\n        madness into a list item right gosh darn her" +
                                "e and\n        let's see what shakes out of the coolness.\n        " + text.bold +
                                text.red + "-" + text.none + " boo these also need to wrap like a\n          pa" +
                                "ragraph. So blah blah wrapping some madness\n          into a list item right " +
                                "gosh darn here and let's\n          see what shakes out of the coolness.\n\n  " +
                                "    " + text.underline + "Command   " + text.normal + text.underline +
                                " Local " + text.normal + text.underline + " Argument Type               " +
                                text.normal + text.underline + " Second Argument " + text.normal + "\n      cop" +
                                "y       " + text.bold + text.green + "✓" + text.none + "      file path or dir" +
                                "ectory path  directory path \n      get        " + text.bold + text.yellow +
                                "?" + text.none + "      file path                    none           \n      gl" +
                                "obal     " + text.bold + text.green + "✓" + text.none + "      none           " +
                                "              none           \n      hash       " + text.bold + text.green +
                                "✓" + text.none + "      file path                    none           \n      he" +
                                "lp       " + text.bold + text.green + "✓" + text.none + "      number         " +
                                "              none           \n      install    " + text.bold + text.yellow +
                                "?" + text.none + "      zip file                     directory path \n      li" +
                                "st       " + text.bold + text.green + "✓" + text.none + "      \"" + text.yellow +
                                "installed" + text.nocolor + "\" or \"" + text.yellow + "published" + text.nocolor +
                                "\"   none           \n      markdown   " + text.bold + text.green + "✓" +
                                text.none + "      path to markdown file        number         \n      publish " +
                                "   " + text.bold + text.green + "✓" + text.none + "      directory path       " +
                                "        directory path \n      remove     " + text.bold + text.green + "✓" +
                                text.none + "      file path or directory path  none           \n      status  " +
                                "   " + text.bold + text.yellow + "?" + text.none + "      none or application " +
                                "name     none           \n      test       " + text.bold + text.red + "X" +
                                text.none + "      none                         none           \n      uninstal" +
                                "l  " + text.bold + text.green + "✓" + text.none + "      application name     " +
                                "        none           \n      unpublish  " + text.bold + text.green + "✓" +
                                text.none + "      application name             none           \n      unzip   " +
                                "   " + text.bold + text.green + "✓" + text.none + "      path to zip file     " +
                                "        directory path \n      zip",
                        name         = "biddle_test_markdown_60";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: name, stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: name, stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout
                        .replace(/\r\n/g, "\n")
                        .slice(0, 8192)
                        .replace(/(\s+)$/, "")
                        .replace(/(\\(\w+)?\s*)$/, "");
                    if (stdout !== markdowntest) {
                        return diffFiles(name, stdout, markdowntest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "markdown 60 test passed." + text.nocolor
                    );
                    flag["60"] = true;
                    if (flag["80"] === true && flag["120"] === true) {
                        next();
                    }
                }
            );
            node.child(
                childcmd + "markdown " + data.abspath + "test" + node.path.sep +
                        "biddletesta" + node.path.sep + "READMEa.md 80 childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_markdown_80(er, stdout, stder) {
                    var markdowntest = "\n" + text.underline + text.bold + text.red + "test README" + text.none + "\ns" +
                                "ome dummy subtext\n\n" + text.underline + text.bold + text.red + "heading by u" +
                                "nderline equals" + text.none + "\n\n" + text.underline + text.bold + text.cyan +
                                "heading by underline dashes" + text.none + "\n\n  ===\n\n" + text.underline +
                                text.bold + text.cyan + "First Secondary Heading" + text.none + "\n    | a big " +
                                "block quote lives here. This is where I am going to experience with\n    | wra" +
                                "pping a block quote a bit differently from other content.  I need\n    | enoug" +
                                "h text in this quote to wrap a couple of times, so I will continue\n    | addi" +
                                "ng some nonsense and as long as it takes to ensure I have a fully\n    | quali" +
                                "fied test.\n    | New line in a block quote\n    | More block\n\n  This is a r" +
                                "egular paragraph that needs to be long enough to wrap a couple\n  times.  This" +
                                " text will be unique from the text in the block quote because\n  uniqueness sa" +
                                "ves time when debugging test failures.  I am now writing a\n  bunch of wrappin" +
                                "g paragraph gibberish, such as f324fasdaowkefsdva.  That\n  one isn't even a w" +
                                "ord.  It isn't cool if it doesn't contain a hyperlink,\n  (" + text.cyan + "ht" +
                                "tp://tonowhwere.nothing" + text.nocolor + "), in some text.\n\n  " + text.bold +
                                text.red + "*" + text.none + " list item 1 these also need to wrap like a parag" +
                                "raph. So blah\n    blah wrapping some madness into a list item right gosh darn" +
                                " here and\n    let's see what shakes out of the coolness.\n  " + text.bold +
                                text.red + "*" + text.none + " list item 2 these also need to wrap like a parag" +
                                "raph. So blah\n    blah wrapping some madness into a list item right gosh darn" +
                                " here and\n    let's see what shakes out of the coolness.\n    " + text.bold +
                                text.red + "-" + text.none + " sublist item 1 these also need to wrap like a pa" +
                                "ragraph. So\n      blah blah wrapping some madness into a list item right gosh" +
                                " darn here\n      and let's see what shakes out of the coolness.\n    " +
                                text.bold + text.red + "-" + text.none + " sublist item 2 these also need to wr" +
                                "ap like a paragraph. So\n      blah blah wrapping some madness into a list ite" +
                                "m right gosh darn here\n      and let's see what shakes out of the coolness.\n" +
                                "      " + text.bold + text.red + "*" + text.none + " subsublist item 1 these a" +
                                "lso need to wrap like a paragraph.\n        So blah blah wrapping some madness" +
                                " into a list item right gosh darn\n        here and let's see what shakes out " +
                                "of the coolness.\n      " + text.bold + text.red + "*" + text.none + " subsubl" +
                                "ist item 2 these also need to wrap like a paragraph.\n        So blah blah wra" +
                                "pping some madness into a list item right gosh darn\n        here and let's se" +
                                "e what shakes out of the coolness.\n  " + text.bold + text.red + "*" + text.none +
                                " list item 3 these also need to wrap like a paragraph. So blah\n    blah wrapp" +
                                "ing some madness into a list item right gosh darn here and\n    let's see what" +
                                " shakes out of the coolness.\n    " + text.bold + text.red + "-" + text.none +
                                " boo these also need to wrap like a paragraph. So blah blah\n      wrapping so" +
                                "me madness into a list item right gosh darn here and let's\n      see what sha" +
                                "kes out of the coolness.\n\n  " + text.underline + text.bold + text.green + "F" +
                                "irst Tertiary Heading #####" + text.none + "\n    This text should be extra in" +
                                "dented.\n\n    " + text.bold + text.red + "*" + text.none +
                                " list item 1\n    " + text.bold + text.red + "*" + text.none + " list item 2\n" +
                                "      " + text.bold + text.red + "-" + text.none + " sublist item 1\n      " +
                                text.bold + text.red + "-" + text.none + " sublist item 2\n        " + text.bold +
                                text.red + "*" + text.none + " subsublist item 1\n        " + text.bold +
                                text.red + "*" + text.none + " subsublist item 2\n    " + text.bold + text.red +
                                "*" + text.none + " list item 3\n      " + text.bold + text.red + "-" + text.none +
                                " boo\n\n    " + text.underline + text.bold + text.yellow + "Gettin Deep with t" +
                                "he Headings" + text.none + "\n\n        | a big block quote lives here. This i" +
                                "s where I am going to experience\n        | with wrapping a block quote a bit " +
                                "differently from other content.\n        | I need enough text in this quote to" +
                                " wrap a couple of times, so I\n        | will continue adding some nonsense an" +
                                "d a long a t takes to ensure I\n        | have a fully qualified test.\n      " +
                                "  | New line in a block quote\n        | More block and not a heading\n       " +
                                " | ----------------------------------------------------------------------\n\n " +
                                "       | a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a" +
                                "\n        | a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a" +
                                "\n        | a a a a\n\n        | aa a a a a a a a a a a a a a a a a a a a a a " +
                                "a a a a a a a a a a a a\n        | a a a a a a a a a a a a a a a a a a a a a a" +
                                " a a a a a a a a a a a a\n        | a a a a\n\n      Horizontal Rule with *\n*" +
                                "******************************************************************************" +
                                "*\n\n      Horizontal Rule with - (requires an empty line between it and text)" +
                                "\n\n--------------------------------------------------------------------------" +
                                "------\n\n      Horizontal Rule with _\n______________________________________" +
                                "__________________________________________\n\n      Images get converted to th" +
                                "eir alt text description.\n\n      This is a regular paragraph that needs to b" +
                                "e long enough to wrap a couple\n      times.  This text will be unique from th" +
                                "e text in the block quote\n      because uniqueness saves time when debugging " +
                                "test failures.  I am now\n      writing a bunch of wrapping paragraph gibberis" +
                                "h, such as\n      f324fasdaowkefsdva.  That one isn't even a word.\n\n      " +
                                text.bold + text.red + "*" + text.none + " list item 1 these also need to wrap " +
                                "like a paragraph. So\n        blah blah wrapping some madness into a list item" +
                                " right gosh darn here\n        and let's see what shakes out of the coolness." +
                                "\n      " + text.bold + text.red + "*" + text.none + " list item 2 these also " +
                                "need to wrap like a paragraph. So\n        blah blah wrapping some madness int" +
                                "o a list item right gosh darn here\n        and let's see what shakes out of t" +
                                "he coolness.\n        " + text.bold + text.red + "-" + text.none + " sublist i" +
                                "tem 1 these also need to wrap like a paragraph.\n          So blah blah wrappi" +
                                "ng some madness into a list item right gosh\n          darn here and let's see" +
                                " what shakes out of the coolness.\n        " + text.bold + text.red + "-" +
                                text.none + " sublist item 2 these also need to wrap like a paragraph.\n       " +
                                "   So blah blah wrapping some madness into a list item right gosh\n          d" +
                                "arn here and let's see what shakes out of the coolness.\n          " + text.bold +
                                text.red + "*" + text.none + " subsublist item 1 these also need to wrap like a" +
                                "\n            paragraph. So blah blah wrapping some madness into a list item r" +
                                "ight\n            gosh darn here and let's see what shakes out of the coolness" +
                                ".\n          " + text.bold + text.red + "*" + text.none + " subsublist item 2 " +
                                "these also need to wrap like a\n            paragraph. So blah blah wrapping s" +
                                "ome madness into a list item right\n            gosh darn here and let's see w" +
                                "hat shakes out of the coolness.\n      " + text.bold + text.red + "*" + text.none +
                                " list item 3 these also need to wrap like a paragraph. So\n        blah blah w" +
                                "rapping some madness into a list item right gosh darn here\n        and let's " +
                                "see what shakes out of the coolness.\n        " + text.bold + text.red + "-" +
                                text.none + " boo these also need to wrap like a paragraph. So blah blah\n     " +
                                "     wrapping some madness into a list item right gosh darn here and\n        " +
                                "  let's see what shakes out of the coolness.\n\n      " + text.underline + "Co" +
                                "mmand   " + text.normal + text.underline + " Local " + text.normal + text.underline +
                                " Argument Type               " + text.normal + text.underline + " Second Argum" +
                                "ent " + text.normal + "\n      copy       " + text.bold + text.green + "✓" +
                                text.none + "      file path or directory path  directory path \n      get     " +
                                "   " + text.bold + text.yellow + "?" + text.none + "      file path           " +
                                "         none           \n      global     " + text.bold + text.green + "✓" +
                                text.none + "      none                         none           \n      hash    " +
                                "   " + text.bold + text.green + "✓" + text.none + "      file path            " +
                                "        none           \n      help       " + text.bold + text.green + "✓" +
                                text.none + "      number                       none           \n      install " +
                                "   " + text.bold + text.yellow + "?" + text.none + "      zip file            " +
                                "         directory path \n      list       " + text.bold + text.green + "✓" +
                                text.none + "      \"" + text.yellow + "installed" + text.nocolor +
                                "\" or \"" + text.yellow + "published" + text.nocolor + "\"   none           \n" +
                                "      markdown   " + text.bold + text.green + "✓" + text.none + "      path to" +
                                " markdown file        number         \n      publish    " + text.bold + text.green +
                                "✓" + text.none + "      directory path               directory path \n      re" +
                                "move     " + text.bold + text.green + "✓" + text.none + "      file path or di" +
                                "rectory path  none           \n      status     " + text.bold + text.yellow +
                                "?" + text.none + "      none or application name     none           \n      te" +
                                "st       " + text.bold + text.red + "X" + text.none + "      none             " +
                                "            none           \n      uninstall  " + text.bold + text.green +
                                "✓" + text.none + "      application name             none           \n      un" +
                                "publish  " + text.bold + text.green + "✓" + text.none + "      application nam" +
                                "e             none           \n      unzip      " + text.bold + text.green +
                                "✓" + text.none + "      path to zip file             directory path \n      zi" +
                                "p        " + text.bold + text.green + "✓" + text.none + "      file path or di" +
                                "rectory path  directory path \n\n" + text.underline + text.bold + text.cyan +
                                "New big Heading" + text.none + "\n  paragraph here to se",
                        name         = "biddle_test_markdown_80";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: name, stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: name, stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout
                        .replace(/\r\n/g, "\n")
                        .slice(0, 8192)
                        .replace(/(\s+)$/, "")
                        .replace(/(\\(\w+)?\s*)$/, "");
                    if (stdout !== markdowntest) {
                        return diffFiles(name, stdout, markdowntest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "markdown 80 test passed." + text.nocolor
                    );
                    flag["80"] = true;
                    if (flag["60"] === true && flag["120"] === true) {
                        next();
                    }
                }
            );
            node.child(
                childcmd + "markdown " + data.abspath + "test" + node.path.sep +
                        "biddletesta" + node.path.sep + "READMEa.md 120 childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_markdown_120(er, stdout, stder) {
                    var markdowntest = "\n" + text.underline + text.bold + text.red + "test README" + text.none + "\ns" +
                                "ome dummy subtext\n\n" + text.underline + text.bold + text.red + "heading by u" +
                                "nderline equals" + text.none + "\n\n" + text.underline + text.bold + text.cyan +
                                "heading by underline dashes" + text.none + "\n\n  ===\n\n" + text.underline +
                                text.bold + text.cyan + "First Secondary Heading" + text.none + "\n    | a big " +
                                "block quote lives here. This is where I am going to experience with wrapping a" +
                                " block quote a bit\n    | differently from other content.  I need enough text " +
                                "in this quote to wrap a couple of times, so I will continue adding\n    | some" +
                                " nonsense and as long as it takes to ensure I have a fully qualified test.\n  " +
                                "  | New line in a block quote\n    | More block\n\n  This is a regular paragra" +
                                "ph that needs to be long enough to wrap a couple times.  This text will be uni" +
                                "que from the\n  text in the block quote because uniqueness saves time when deb" +
                                "ugging test failures.  I am now writing a bunch of\n  wrapping paragraph gibbe" +
                                "rish, such as f324fasdaowkefsdva.  That one isn't even a word.  It isn't cool " +
                                "if it\n  doesn't contain a hyperlink, (" + text.cyan + "http://tonowhwere.noth" +
                                "ing" + text.nocolor + "), in some text.\n\n  " + text.bold + text.red + "*" +
                                text.none + " list item 1 these also need to wrap like a paragraph. So blah bla" +
                                "h wrapping some madness into a list\n    item right gosh darn here and let's s" +
                                "ee what shakes out of the coolness.\n  " + text.bold + text.red + "*" + text.none +
                                " list item 2 these also need to wrap like a paragraph. So blah blah wrapping s" +
                                "ome madness into a list\n    item right gosh darn here and let's see what shak" +
                                "es out of the coolness.\n    " + text.bold + text.red + "-" + text.none + " su" +
                                "blist item 1 these also need to wrap like a paragraph. So blah blah wrapping s" +
                                "ome madness into a\n      list item right gosh darn here and let's see what sh" +
                                "akes out of the coolness.\n    " + text.bold + text.red + "-" + text.none + " " +
                                "sublist item 2 these also need to wrap like a paragraph. So blah blah wrapping" +
                                " some madness into a\n      list item right gosh darn here and let's see what " +
                                "shakes out of the coolness.\n      " + text.bold + text.red + "*" + text.none +
                                " subsublist item 1 these also need to wrap like a paragraph. So blah blah wrap" +
                                "ping some madness into\n        a list item right gosh darn here and let's see" +
                                " what shakes out of the coolness.\n      " + text.bold + text.red + "*" +
                                text.none + " subsublist item 2 these also need to wrap like a paragraph. So bl" +
                                "ah blah wrapping some madness into\n        a list item right gosh darn here a" +
                                "nd let's see what shakes out of the coolness.\n  " + text.bold + text.red +
                                "*" + text.none + " list item 3 these also need to wrap like a paragraph. So bl" +
                                "ah blah wrapping some madness into a list\n    item right gosh darn here and l" +
                                "et's see what shakes out of the coolness.\n    " + text.bold + text.red + "-" +
                                text.none + " boo these also need to wrap like a paragraph. So blah blah wrappi" +
                                "ng some madness into a list item\n      right gosh darn here and let's see wha" +
                                "t shakes out of the coolness.\n\n  " + text.underline + text.bold + text.green +
                                "First Tertiary Heading #####" + text.none + "\n    This text should be extra i" +
                                "ndented.\n\n    " + text.bold + text.red + "*" + text.none + " list item 1\n  " +
                                "  " + text.bold + text.red + "*" + text.none + " list item 2\n      " + text.bold +
                                text.red + "-" + text.none + " sublist item 1\n      " + text.bold + text.red +
                                "-" + text.none + " sublist item 2\n        " + text.bold + text.red + "*" +
                                text.none + " subsublist item 1\n        " + text.bold + text.red + "*" +
                                text.none + " subsublist item 2\n    " + text.bold + text.red + "*" + text.none +
                                " list item 3\n      " + text.bold + text.red + "-" + text.none +
                                " boo\n\n    " + text.underline + text.bold + text.yellow + "Gettin Deep with t" +
                                "he Headings" + text.none + "\n\n        | a big block quote lives here. This i" +
                                "s where I am going to experience with wrapping a block quote a bit\n        | " +
                                "differently from other content.  I need enough text in this quote to wrap a co" +
                                "uple of times, so I will continue\n        | adding some nonsense and a long a" +
                                " t takes to ensure I have a fully qualified test.\n        | New line in a blo" +
                                "ck quote\n        | More block and not a heading\n        | ------------------" +
                                "------------------------------------------------------------------------------" +
                                "--------------\n\n        | a a a a a a a a a a a a a a a a a a a a a a a a a " +
                                "a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a\n        | a a a a" +
                                " a a a a a a a a a a a a a\n\n        | aa a a a a a a a a a a a a a a a a a a" +
                                " a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a a\n      " +
                                "  | a a a a a a a a a a a a a a a a a a\n\n      Horizontal Rule with *\n*****" +
                                "******************************************************************************" +
                                "*************************************\n\n      Horizontal Rule with - (require" +
                                "s an empty line between it and text)\n\n--------------------------------------" +
                                "------------------------------------------------------------------------------" +
                                "----\n\n      Horizontal Rule with _\n________________________________________" +
                                "______________________________________________________________________________" +
                                "__\n\n      Images get converted to their alt text description.\n\n      This " +
                                "is a regular paragraph that needs to be long enough to wrap a couple times.  T" +
                                "his text will be unique from the\n      text in the block quote because unique" +
                                "ness saves time when debugging test failures.  I am now writing a\n      bunch" +
                                " of wrapping paragraph gibberish, such as f324fasdaowkefsdva.  That one isn't " +
                                "even a word.\n\n      " + text.bold + text.red + "*" + text.none + " list item" +
                                " 1 these also need to wrap like a paragraph. So blah blah wrapping some madnes" +
                                "s into a list\n        item right gosh darn here and let's see what shakes out" +
                                " of the coolness.\n      " + text.bold + text.red + "*" + text.none + " list i" +
                                "tem 2 these also need to wrap like a paragraph. So blah blah wrapping some mad" +
                                "ness into a list\n        item right gosh darn here and let's see what shakes " +
                                "out of the coolness.\n        " + text.bold + text.red + "-" + text.none + " s" +
                                "ublist item 1 these also need to wrap like a paragraph. So blah blah wrapping " +
                                "some madness into a\n          list item right gosh darn here and let's see wh" +
                                "at shakes out of the coolness.\n        " + text.bold + text.red + "-" +
                                text.none + " sublist item 2 these also need to wrap like a paragraph. So blah " +
                                "blah wrapping some madness into a\n          list item right gosh darn here an" +
                                "d let's see what shakes out of the coolness.\n          " + text.bold + text.red +
                                "*" + text.none + " subsublist item 1 these also need to wrap like a paragraph." +
                                " So blah blah wrapping some madness\n            into a list item right gosh d" +
                                "arn here and let's see what shakes out of the coolness.\n          " + text.bold +
                                text.red + "*" + text.none + " subsublist item 2 these also need to wrap like a" +
                                " paragraph. So blah blah wrapping some madness\n            into a list item r" +
                                "ight gosh darn here and let's see what shakes out of the coolness.\n      " +
                                text.bold + text.red + "*" + text.none + " list item 3 these also need to wrap " +
                                "like a paragraph. So blah blah wrapping some madness into a list\n        item" +
                                " right gosh darn here and let's see what shakes out of the coolness.\n        " +
                                text.bold + text.red + "-" + text.none + " boo these also need to wrap like a p" +
                                "aragraph. So blah blah wrapping some madness into a list item\n          right" +
                                " gosh darn here and let's see what shakes out of the coolness.\n\n      " +
                                text.underline + "Command   " + text.normal + text.underline + " Local " +
                                text.normal + text.underline + " Argument Type               " + text.normal +
                                text.underline + " Second Argument " + text.normal + "\n      copy       " +
                                text.bold + text.green + "✓" + text.none + "      file path or directory path  " +
                                "directory path \n      get        " + text.bold + text.yellow + "?" + text.none +
                                "      file path                    none           \n      global     " +
                                text.bold + text.green + "✓" + text.none + "      none                         " +
                                "none           \n      hash       " + text.bold + text.green + "✓" + text.none +
                                "      file path                    none           \n      help       " +
                                text.bold + text.green + "✓" + text.none + "      number                       " +
                                "none           \n      install    " + text.bold + text.yellow + "?" + text.none +
                                "      zip file                     directory path \n      list       " +
                                text.bold + text.green + "✓" + text.none + "      \"" + text.yellow +
                                "installed" + text.nocolor + "\" or \"" + text.yellow + "published" + text.nocolor +
                                "\"   none           \n      markdown   " + text.bold + text.green + "✓" +
                                text.none + "      path to markdown file        number         \n      publish " +
                                "   " + text.bold + text.green + "✓" + text.none + "      directory path       " +
                                "        directory path \n      remove     " + text.bold + text.green + "✓" +
                                text.none + "      file path or directory path  none           \n      status  " +
                                "   " + text.bold + text.yellow + "?" + text.none + "      none or application " +
                                "name     none           \n      test       " + text.bold + text.red + "X" +
                                text.none + "      none                         none           \n      uninstal" +
                                "l  " + text.bold + text.green + "✓" + text.none + "      application name     " +
                                "        none           \n      unpublish  " + text.bold + text.green + "✓" +
                                text.none + "      application name             none           \n      unzip   " +
                                "   " + text.bold + text.green + "✓" + text.none + "      path to zip file     " +
                                "        directory path \n      zip        " + text.bold + text.green + "✓" +
                                text.none + "      file path or directory path  directory path \n\n" + text.underline +
                                text.bold + text.cyan + "New big Heading" + text.none + "\n  paragraph here to " +
                                "see if indentation is largely res",
                        name         = "biddle_test_markdown_120";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: name, stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: name, stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout
                        .replace(/\r\n/g, "\n")
                        .slice(0, 8192)
                        .replace(/(\s+)$/, "")
                        .replace(/(\\(\w+)?)$/, "");
                    if (stdout !== markdowntest) {
                        return diffFiles(name, stdout, markdowntest);
                    }
                    console.log(
                        humantime(false) + " " + text.green + "mmarkdown 120 test passed." + text.nocolor
                    );
                    flag["120"] = true;
                    if (flag["60"] === true && flag["80"] === true) {
                        next();
                    }
                }
            );
        };
        phases.moduleInstall   = function biddle_test_moduleInstall() {
            var dateobj    = new Date(),
                day        = (dateobj.getDate() > 9)
                    ? "" + dateobj.getDate()
                    : "0" + dateobj.getDate(),
                month      = (dateobj.getMonth() > 8)
                    ? "" + (
                        dateobj.getMonth() + 1
                    )
                    : "0" + (
                        dateobj.getMonth() + 1
                    ),
                date       = Number("" + dateobj.getFullYear() + month + day),
                ind        = 0,
                today      = require(data.abspath + "today.js"),
                intpath    = __dirname + node.path.sep + "internal" + node.path.sep,
                modules    = {
                    jslint    : "http://prettydiff.com/downloads/jslint/jslint_latest.zip",
                    prettydiff: "http://prettydiff.com/downloads/prettydiff/prettydiff_cli_latest.zip"
                },
                versions   = {},
                inst       = 0,
                newinstall = false,
                keys       = Object.keys(modules),
                complete   = function biddle_test_moduleInstall_complete() {
                    var verkeys  = Object.keys(versions),
                        len      = verkeys.length,
                        a        = 0,
                        longname = (function biddle_test_moduleInstall_complete_longname() {
                            var aa   = 0,
                                long = 0;
                            do {
                                if (verkeys[aa].length > long) {
                                    long = verkeys[aa].length;
                                }
                                aa = aa + 1;
                            } while (aa < len);
                            return long;
                        }()),
                        namepad  = function biddle_test_namepad(name) {
                            var aa = name.length;
                            if (name.length === longname) {
                                return name;
                            }
                            do {
                                aa   = aa + 1;
                                name = name + " ";
                            } while (aa < longname);
                            return name;
                        };
                    verkeys.sort();
                    console.log("Installed module versions");
                    console.log("-------------------------");
                    do {
                        console.log(
                            "* " + text.bold + text.cyan + namepad(verkeys[a]) + text.none + " - " + text.bold +
                            text.green + versions[verkeys[a]] + text.none
                        );
                        a = a + 1;
                    } while (a < len);
                    next();
                },
                writeToday = function biddle_test_moduleInstall_writeToday() {
                    node
                        .fs
                        .writeFile(
                            data.abspath + "today.js",
                            "/\u002aglobal module\u002a/(function () {\"use strict\";var today=" + date + ";module.exports=today;}());",
                            function biddle_test_moduleInstall_writeToday_writeFile(werr) {
                                if (werr !== null && werr !== undefined) {
                                    return apps.errout(
                                        {error: werr, name: "biddle_test_moduleInstall_writeToday_writeFile", time: humantime(true)}
                                    );
                                }
                                complete();
                            }
                        );
                },
                modcheck   = function biddle_test_moduleInstall_modcheck(mod) {
                    var modinstall = function biddle_test_moduleInstall_modcheck_modinstall() {
                            apps.install(
                                modules[mod],
                                function biddle_test_moduleInstall_modcheck_modinstall_install(packjson) {
                                    newinstall    = true;
                                    mods[mod]     = require(intpath + mod + node.path.sep + packjson.main);
                                    versions[mod] = packjson.version;
                                    inst          = inst + 1;
                                    if (inst === keys.length) {
                                        writeToday();
                                    }
                                }
                            );
                        },
                        modrequire = function biddle_test_moduleInstall_modrequire() {
                            node
                                .fs
                                .readFile(
                                    intpath + mod + node.path.sep + "package.json",
                                    "utf8",
                                    function biddle_test_moduleInstall_modrequire_readFile(packer, packjson) {
                                        var json = {};
                                        if (packer !== null) {
                                            return apps.errout(
                                                {error: packer, name: "biddle_test_moduleInstall_modrequire_readFile", stdout: packjson, time: humantime(true)}
                                            );
                                        }
                                        json          = JSON.parse(packjson);
                                        versions[mod] = json.version;
                                        mods[mod]     = require(intpath + mod + node.path.sep + json.main);
                                        inst          = inst + 1;
                                        if (inst === keys.length) {
                                            if (newinstall === true) {
                                                writeToday();
                                            } else {
                                                complete();
                                            }
                                        }
                                    }
                                );
                        };
                    node
                        .fs
                        .stat(
                            intpath + mod + node.path.sep + "package.json",
                            function biddle_test_moduleInstall_modcheck_stat(erstat, stats) {
                                if (erstat === null && stats.isFile() === true && data.installed.internal !== undefined && data.installed.internal[mod] !== undefined) {
                                    if (date > today) {
                                        apps.update(mod, true, modrequire);
                                    } else {
                                        modrequire();
                                    }
                                } else {
                                    modinstall();
                                }
                            }
                        );
                };
            if (date > today) {
                newinstall = true;
            }
            do {
                modcheck(keys[ind]);
                ind = ind + 1;
            } while (ind < keys.length);
        };
        phases.publishA        = function biddle_test_publishA() {
            phasenumb = phasenumb + 1;
            console.log(
                phasenumb + ". First set of publish tests"
            );
            node.child(
                childcmd + "publish " + data.abspath + "test" + node.path.sep + "biddletesta ch" +
                        "ildtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_publishA_child(er, stdout, stder) {
                    var bgreen      = text.bold + text.green,
                        bcyan       = text.bold + text.cyan,
                        publishtest = "File publications/biddletesta/biddlesort.js written at " +
                                bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletesta/biddletest" +
                                "a_" + bcyan + "xxx.zip" + text.none + " written at " + bgreen + "xxx" + text.none +
                                " bytes.\nFile publications/biddletesta/biddletesta_" + bcyan + "latest.zip" +
                                text.none + " written at " + bgreen + "xxx" + text.none + " bytes.\nFile public" +
                                "ations/biddletesta/biddletesta_" + bcyan + "min_xxx.zip" + text.none + " writt" +
                                "en at " + bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletesta" +
                                "/biddletesta_" + bcyan + "min_latest.zip" + text.none + " written at " +
                                bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletesta/biddletest" +
                                "a_" + bcyan + "prod_xxx.zip" + text.none + " written at " + bgreen + "xxx" +
                                text.none + " bytes.\nFile publications/biddletesta/biddletesta_" + bcyan + "pr" +
                                "od_latest.zip" + text.none + " written at " + bgreen + "xxx" + text.none + " b" +
                                "ytes.\nFile publications/biddletesta/filedata.json written at " + bgreen +
                                "xxx" + text.none + " bytes.\nFile publications/biddletesta/index.xhtml written" +
                                " at " + bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletesta/l" +
                                "atest.txt written at " + bgreen + "xxx" + text.none + " bytes.",
                        outputs     = stdout
                            .replace(/(\s+)$/, "")
                            .replace("\r\n", "\n")
                            .split("\n")
                            .sort(function biddle_test_publishA_child_outSort(a, b) {
                                if (a > b) {
                                    return 1;
                                }
                                return -1;
                            }),
                        output      = "",
                        abspath     = new RegExp(data.abspath.replace(/\\/g, "\\\\"), "g");
                    if (er !== null) {
                        apps.errout(
                            {error: er, name: "biddle_test_publishA_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        apps.errout(
                            {error: stder, name: "biddle_test_publishA_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    node
                        .fs
                        .stat(
                            data.abspath + "temp",
                            function biddle_test_publishA_child_statTemp(errtemp) {
                                if (errtemp === null) {
                                    return apps.errout(
                                        {error: "Failed to remove directory 'temp' from publish operation.", name: "biddle_test_publishA_child_statTemp", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (errtemp.toString().indexOf("no such file or directory") < 0) {
                                    return apps.errout(
                                        {error: errtemp, name: "biddle_test_publishA_child_statTemp", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                outputs.forEach(
                                    function biddle_test_publishA_child_statTemp_formatOutput(value, index, array) {
                                        var val = value.slice(value.indexOf("publications"));
                                        array[index] = "File " + val;
                                    }
                                );
                                output = outputs.join("\n");
                                output = output.replace(/\\/g, "/");
                                output = output
                                    .replace(/\d+\.\d+\.\d+\.zip/g, "xxx.zip")
                                    .replace(/\u001b\[32m\d+(,\d+)*/g, text.green + "xxx")
                                    .replace(abspath, "");
                                if (stdout.indexOf("Error") > 0) {
                                    console.log(stdout);
                                    return apps.errout(
                                        {error: "Error from child process", name: "biddle_test_publishA_child_statTemp", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (output !== publishtest) {
                                    return diffFiles("biddle_test_publishA_child_statTemp", output, publishtest);
                                }
                                console.log(
                                    humantime(false) + " " + text.green + "The stdout for publish is correct." +
                                    text.nocolor
                                );
                                node
                                    .fs
                                    .readFile(
                                        data.abspath + "published.json",
                                        "utf8",
                                        function biddle_test_publishA_child_statTemp_readJSON(err, fileData) {
                                            var jsondata = {},
                                                pub      = data.abspath + "publications" + node.path.sep + "biddletesta";
                                            if (err !== null && err !== undefined) {
                                                return apps.errout(
                                                    {error: err, name: "biddle_test_publishA_child_statTemp_readJSON", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            jsondata = JSON.parse(fileData);
                                            if (jsondata.biddletesta === undefined) {
                                                return apps.errout(
                                                    {error: "No biddletesta property in published.json file.", name: "biddle_test_publishA_child_statTemp_readJSON", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            if ((/^(99\.99\.\d{4})$/).test(jsondata.biddletesta.latest) === false) {
                                                return apps.errout({
                                                    error : "biddletesta.latest of published.json is '" + jsondata.biddletesta.latest + "' " +
                                                            "not equivalent to '99\\.99\\.\\d{4}'.",
                                                    name  : "biddle_test_publishA_child_statTemp_readJSON",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green +
                                                "File published.json contains biddletesta" + text.nocolor
                                            );
                                            node
                                                .fs
                                                .readdir(
                                                    pub,
                                                    function biddle_test_publishA_child_statTemp_readJSON_readdir(errr, files) {
                                                        var filetest = "biddlesort.js,biddletesta_v.hash,biddletesta_v.zip,biddletesta_latest.hash,bid" +
                                                                    "dletesta_latest.zip,biddletesta_min_v.hash,biddletesta_min_v.zip,biddletesta_m" +
                                                                    "in_latest.hash,biddletesta_min_latest.zip,biddletesta_prod_v.hash,biddletesta_" +
                                                                    "prod_v.zip,biddletesta_prod_latest.hash,biddletesta_prod_latest.zip,filedata.j" +
                                                                    "son,index.xhtml,latest.txt",
                                                            filelist = files
                                                                .sort(
                                                                    function biddle_test_publishA_child_statTemp_readJSON_readdir_outSort(a, b) {
                                                                        if (a > b) {
                                                                            return 1;
                                                                        }
                                                                        return -1;
                                                                    }
                                                                )
                                                                .join(",")
                                                                .replace(
                                                                    /_\d+\.\d+\.\d+\.((zip)|(hash))/g,
                                                                    function biddle_test_publishA_child_statTemp_readJSON_readdir_replace(x) {
                                                                        if (x.indexOf("zip") > 0) {
                                                                            return "_v.zip";
                                                                        }
                                                                        return "_v.hash";
                                                                    }
                                                                ),
                                                            stats    = {},
                                                            statfile = function biddle_test_publishA_child_statTemp_readJSON_readdir_statfile(
                                                                index
                                                            ) {
                                                                stats[files[index]] = false;
                                                                node
                                                                    .fs
                                                                    .stat(
                                                                        pub + node.path.sep + files[index],
                                                                        function biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback(errs, statobj) {
                                                                            if (errs !== null) {
                                                                                return apps.errout(
                                                                                    {error: errs, name: "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback", stdout: stdout, time: humantime(true)}
                                                                                );
                                                                            }
                                                                            if (files[index].indexOf(".hash") === files[index].length - 5 && statobj.size !== 128) {
                                                                                return apps.errout({
                                                                                    error : "Expected hash file " + files[index] + " to be file size 128.",
                                                                                    name  : "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback",
                                                                                    stdout: stdout,
                                                                                    time  : humantime(true)
                                                                                });
                                                                            }
                                                                            if (files[index].indexOf(".zip") === files[index].length - 4 && statobj.size > 20000) {
                                                                                return apps.errout({
                                                                                    error : "Zip file " + files[index] + " is too big at " + apps.commas(
                                                                                        statobj.size
                                                                                    ) + ".",
                                                                                    name  : "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback",
                                                                                    stdout: stdout,
                                                                                    time  : humantime(true)
                                                                                });
                                                                            }
                                                                            console.log(
                                                                                humantime(false) + " " + files[index] + " present at size " + text.bold +
                                                                                text.green + apps.commas(statobj.size) + text.none + " bytes."
                                                                            );
                                                                            stats[files[index]] = true;
                                                                            if (stats[files[0]] === true && stats[files[1]] === true && stats[files[2]] === true && stats[files[3]] === true && stats[files[4]] === true && stats[files[5]] === true && stats[files[6]] === true && stats[files[7]] === true && stats[files[8]] === true && stats[files[9]] === true && stats[files[10]] === true && stats[files[11]] === true) {
                                                                                console.log(
                                                                                    humantime(false) + " " + text.green + "publish test passed." + text.nocolor
                                                                                );
                                                                                node.child(
                                                                                    childcmd + "publish " + data.abspath + "test" + node.path.sep + "biddletesta ch" +
                                                                                            "ildtest",
                                                                                    {
                                                                                        cwd: data.abspath
                                                                                    },
                                                                                    function biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish(erx, stdoutx, stderx) {
                                                                                        var publishagain = text.bold + text.cyan + "Function:" + text.none + " biddle_p" +
                                                                                                    "ublish_execution\n" + text.bold + text.red + "Error:" + text.none + " Attempte" +
                                                                                                    "d to publish biddletesta over existing version",
                                                                                            stack        = [];
                                                                                        if (erx !== null) {
                                                                                            if (typeof erx.stack === "string") {
                                                                                                stack = erx
                                                                                                    .stack
                                                                                                    .split(" at ");
                                                                                            }
                                                                                            if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:2") < 0) {
                                                                                                return apps.errout(
                                                                                                    {error: erx, name: "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish", stdout: stdout, time: humantime(true)}
                                                                                                );
                                                                                            }
                                                                                        }
                                                                                        if (stderx !== null && stderx !== "") {
                                                                                            return apps.errout(
                                                                                                {error: stderx, name: "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish", stdout: stdout, time: humantime(true)}
                                                                                            );
                                                                                        }
                                                                                        stdoutx = stdoutx
                                                                                            .replace("\r\n", "\n")
                                                                                            .replace(/(\u0020\d+\.\d+\.\d+\s*)$/, "")
                                                                                            .slice(0, stdoutx.indexOf(" version") + 8);
                                                                                        if (stdoutx !== publishagain) {
                                                                                            return diffFiles(
                                                                                                "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish",
                                                                                                stdoutx,
                                                                                                publishagain
                                                                                            );
                                                                                        }
                                                                                        node
                                                                                            .fs
                                                                                            .stat(
                                                                                                data.abspath + "temp",
                                                                                                function biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish_statTemp(errtemp) {
                                                                                                    if (errtemp === null) {
                                                                                                        return apps.errout({
                                                                                                            error: "Failed to remove directory 'temp' from publish operation.",
                                                                                                            name : "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish" +
                                                                                                                    "_statTemp",
                                                                                                            time : humantime(true)
                                                                                                        });
                                                                                                    }
                                                                                                    if (errtemp.toString().indexOf("no such file or directory") < 0) {
                                                                                                        return apps.errout({
                                                                                                            error: errtemp,
                                                                                                            name : "biddle_test_publishA_child_statTemp_readJSON_readdir_statfile_statback_publish" +
                                                                                                                    "_statTemp",
                                                                                                            time : humantime(true)
                                                                                                        });
                                                                                                    }
                                                                                                    console.log(
                                                                                                        humantime(false) + " " + text.green + "Redundant publish test (error messaging)" +
                                                                                                        " passed." + text.nocolor
                                                                                                    );
                                                                                                    next();
                                                                                                }
                                                                                            );
                                                                                    }
                                                                                );
                                                                            }
                                                                        }
                                                                    );
                                                            };
                                                        if (errr !== null) {
                                                            return apps.errout(
                                                                {error: errr, name: "biddle_test_publishA_child_statTemp_readJSON_readdir", stdout: stdout, time: humantime(true)}
                                                            );
                                                        }
                                                        if (filelist !== filetest) {
                                                            return diffFiles(
                                                                "biddle_test_publishA_child_statTemp_readJSON_readdir",
                                                                filelist,
                                                                filetest
                                                            );
                                                        }
                                                        console.log(
                                                            humantime(false) + " " + text.green + "List of files generated by publish is co" +
                                                            "rrect." + text.nocolor
                                                        );
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
                                                    }
                                                );
                                            return stdout;
                                        }
                                    );
                            }
                        );
                }
            );
        };
        phases.publishB        = function biddle_test_publishB() {
            phasenumb = phasenumb + 1;
            console.log(
                phasenumb + ". Second set of publish tests"
            );
            node.child(
                childcmd + "publish " + data.abspath + "test" + node.path.sep + "biddletestb ch" +
                        "ildtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_publishB_child(er, stdout, stder) {
                    var bgreen      = text.bold + text.green,
                        bcyan       = text.bold + text.cyan,
                        publishtest = "File publications/biddletestb/biddlesort.js written at " +
                                bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletestb/biddletest" +
                                "b_" + bcyan + "xxx.zip" + text.none + " written at " + bgreen + "xxx" + text.none +
                                " bytes.\nFile publications/biddletestb/biddletestb_" + bcyan + "latest.zip" +
                                text.none + " written at " + bgreen + "xxx" + text.none + " bytes.\nFile public" +
                                "ations/biddletestb/biddletestb_" + bcyan + "min_xxx.zip" + text.none + " writt" +
                                "en at " + bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletestb" +
                                "/biddletestb_" + bcyan + "min_latest.zip" + text.none + " written at " +
                                bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletestb/biddletest" +
                                "b_" + bcyan + "prod_xxx.zip" + text.none + " written at " + bgreen + "xxx" +
                                text.none + " bytes.\nFile publications/biddletestb/biddletestb_" + bcyan + "pr" +
                                "od_latest.zip" + text.none + " written at " + bgreen + "xxx" + text.none + " b" +
                                "ytes.\nFile publications/biddletestb/filedata.json written at " + bgreen +
                                "xxx" + text.none + " bytes.\nFile publications/biddletestb/index.xhtml written" +
                                " at " + bgreen + "xxx" + text.none + " bytes.\nFile publications/biddletestb/l" +
                                "atest.txt written at " + bgreen + "xxx" + text.none + " bytes.",
                        outputs     = stdout
                            .replace(/(\s+)$/, "")
                            .replace("\r\n", "\n")
                            .split("\n")
                            .sort(function biddle_test_publishB_child_outSort(a, b) {
                                if (a > b) {
                                    return 1;
                                }
                                return -1;
                            }),
                        output      = "",
                        abspath     = new RegExp(data.abspath.replace(/\\/g, "\\\\"), "g");
                    if (er !== null) {
                        apps.errout(
                            {error: er, name: "biddle_test_publishA_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        apps.errout(
                            {error: stder, name: "biddle_test_publishA_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    node
                        .fs
                        .stat(
                            data.abspath + "temp",
                            function biddle_test_publishB_child_statTemp(errtemp) {
                                if (errtemp === null) {
                                    return apps.errout(
                                        {error: "Failed to remove directory 'temp' from publish operation.", name: "biddle_test_publishB_child_statTemp", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (errtemp.toString().indexOf("no such file or directory") < 0) {
                                    return apps.errout(
                                        {error: errtemp, name: "biddle_test_publishB_child_statTemp", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                outputs.forEach(
                                    function biddle_test_publishB_child_statTemp_formatOutput(value, index, array) {
                                        var val = value.slice(value.indexOf("publications"));
                                        array[index] = "File " + val;
                                    }
                                );
                                output = outputs.join("\n");
                                output = output.replace(/\\/g, "/");
                                output = output
                                    .replace(/\d+\.\d+\.\d+\.zip/g, "xxx.zip")
                                    .replace(/(\u001b\[32m\d+(,\d+)*)/g, text.green + "xxx")
                                    .replace(abspath, "");
                                if (stdout.indexOf("Error") > 0) {
                                    console.log(stdout);
                                    return apps.errout(
                                        {error: "Error from child process", name: "biddle_test_publishB_child_statTemp", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (output !== publishtest) {
                                    return diffFiles("biddle_test_publishB_child_statTemp", output, publishtest);
                                }
                                console.log(
                                    humantime(false) + " " + text.green + "The stdout for publish is correct." +
                                    text.nocolor
                                );
                                node
                                    .fs
                                    .readFile(
                                        data.abspath + "published.json",
                                        "utf8",
                                        function biddle_test_publishB_child_statTemp_readJSON(err, fileData) {
                                            var jsondata = {},
                                                pub      = data.abspath + "unittest" + node.path.sep + "publications" + node.path.sep +
                                                        "biddletestb";
                                            if (err !== null && err !== undefined) {
                                                return apps.errout(
                                                    {error: err, name: "biddle_test_publishB_child_statTemp_readJSON", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            jsondata = JSON.parse(fileData);
                                            if (jsondata.biddletestb === undefined) {
                                                return apps.errout(
                                                    {error: "No biddletestb property in published.json file.", name: "biddle_test_publishB_child_statTemp_readJSON", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            if (jsondata.biddletestb.latest !== "98.98.1234") {
                                                return apps.errout({
                                                    error : "biddletestb.latest of published.json is '" + jsondata.biddletestb.latest + "' " +
                                                            "not 98.98.1234'.",
                                                    name  : "biddle_test_publishB_child_statTemp_readJSON",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green +
                                                "File published.json contains biddletestb" + text.nocolor
                                            );
                                            node
                                                .fs
                                                .readdir(
                                                    pub,
                                                    function biddle_test_publishB_child_statTemp_readJSON_readdir(errr, files) {
                                                        var filetest = "biddlesort.js,biddletestb_v.hash,biddletestb_v.zip,biddletestb_latest.hash,bid" +
                                                                    "dletestb_latest.zip,biddletestb_min_v.hash,biddletestb_min_v.zip,biddletestb_m" +
                                                                    "in_latest.hash,biddletestb_min_latest.zip,biddletestb_prod_v.hash,biddletestb_" +
                                                                    "prod_v.zip,biddletestb_prod_latest.hash,biddletestb_prod_latest.zip,filedata.j" +
                                                                    "son,index.xhtml,latest.txt",
                                                            filelist = files
                                                                .sort(
                                                                    function biddle_test_publishB_child_statTemp_readJSON_readdir_outSort(a, b) {
                                                                        if (a > b) {
                                                                            return 1;
                                                                        }
                                                                        return -1;
                                                                    }
                                                                )
                                                                .join(",")
                                                                .replace(
                                                                    /_\d+\.\d+\.\d+\.((zip)|(hash))/g,
                                                                    function biddle_test_publishB_child_statTemp_readJSON_readdir_replace(x) {
                                                                        if (x.indexOf("zip") > 0) {
                                                                            return "_v.zip";
                                                                        }
                                                                        return "_v.hash";
                                                                    }
                                                                ),
                                                            stats    = {},
                                                            statfile = function biddle_test_publishB_child_statTemp_readJSON_readdir_statfile(
                                                                index
                                                            ) {
                                                                stats[files[index]] = false;
                                                                node
                                                                    .fs
                                                                    .stat(
                                                                        pub + node.path.sep + files[index],
                                                                        function biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback(errs, statobj) {
                                                                            if (errs !== null) {
                                                                                return apps.errout(
                                                                                    {error: errs, name: "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback", stdout: stdout, time: humantime(true)}
                                                                                );
                                                                            }
                                                                            if (files[index].indexOf(".hash") === files[index].length - 5 && statobj.size !== 128) {
                                                                                return apps.errout({
                                                                                    error : "Expected hash file " + files[index] + " to be file size 128.",
                                                                                    name  : "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback",
                                                                                    stdout: stdout,
                                                                                    time  : humantime(true)
                                                                                });
                                                                            }
                                                                            if (files[index].indexOf(".zip") === files[index].length - 4 && statobj.size > 20000) {
                                                                                return apps.errout({
                                                                                    error : "Zip file " + files[index] + " is too big at " + apps.commas(
                                                                                        statobj.size
                                                                                    ) + ".",
                                                                                    name  : "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback",
                                                                                    stdout: stdout,
                                                                                    time  : humantime(true)
                                                                                });
                                                                            }
                                                                            console.log(
                                                                                humantime(false) + " " + files[index] + " present at size " + text.bold +
                                                                                text.green + apps.commas(statobj.size) + text.none + " bytes."
                                                                            );
                                                                            stats[files[index]] = true;
                                                                            if (stats[files[0]] === true && stats[files[1]] === true && stats[files[2]] === true && stats[files[3]] === true && stats[files[4]] === true && stats[files[5]] === true && stats[files[6]] === true && stats[files[7]] === true && stats[files[8]] === true && stats[files[9]] === true && stats[files[10]] === true && stats[files[11]] === true) {
                                                                                console.log(
                                                                                    humantime(false) + " " + text.green + "publish test passed." + text.nocolor
                                                                                );
                                                                                node.child(
                                                                                    childcmd + "publish " + data.abspath + "test" + node.path.sep + "biddletestb ch" +
                                                                                            "ildtest",
                                                                                    {
                                                                                        cwd: data.abspath
                                                                                    },
                                                                                    function biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish(erx, stdoutx, stderx) {
                                                                                        var publishagain = text.bold + text.cyan + "Function:" + text.none + " biddle_p" +
                                                                                                    "ublish_execution\n" + text.bold + text.red + "Error:" + text.none + " Attempte" +
                                                                                                    "d to publish biddletestb over existing version",
                                                                                            stack        = [];
                                                                                        if (erx !== null) {
                                                                                            if (typeof erx.stack === "string") {
                                                                                                stack = erx
                                                                                                    .stack
                                                                                                    .split(" at ");
                                                                                            }
                                                                                            if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:2") < 0) {
                                                                                                return apps.errout(
                                                                                                    {error: erx, name: "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish", stdout: stdout, time: humantime(true)}
                                                                                                );
                                                                                            }
                                                                                        }
                                                                                        if (stderx !== null && stderx !== "") {
                                                                                            return apps.errout(
                                                                                                {error: stderx, name: "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish", stdout: stdout, time: humantime(true)}
                                                                                            );
                                                                                        }
                                                                                        stdoutx = stdoutx
                                                                                            .replace("\r\n", "\n")
                                                                                            .replace(/(\u0020\d+\.\d+\.\d+\s*)$/, "")
                                                                                            .slice(0, stdoutx.indexOf(" version") + 8);
                                                                                        if (stdoutx !== publishagain) {
                                                                                            return diffFiles(
                                                                                                "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish",
                                                                                                stdoutx,
                                                                                                publishagain
                                                                                            );
                                                                                        }
                                                                                        node
                                                                                            .fs
                                                                                            .stat(
                                                                                                data.abspath + "temp",
                                                                                                function biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish_statTemp(errtemp) {
                                                                                                    if (errtemp === null) {
                                                                                                        return apps.errout({
                                                                                                            error: "Failed to remove directory 'temp' from publish operation.",
                                                                                                            name : "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish" +
                                                                                                                    "_statTemp",
                                                                                                            time : humantime(true)
                                                                                                        });
                                                                                                    }
                                                                                                    if (errtemp.toString().indexOf("no such file or directory") < 0) {
                                                                                                        return apps.errout({
                                                                                                            error: errtemp,
                                                                                                            name : "biddle_test_publishB_child_statTemp_readJSON_readdir_statfile_statback_publish" +
                                                                                                                    "_statTemp",
                                                                                                            time : humantime(true)
                                                                                                        });
                                                                                                    }
                                                                                                    console.log(
                                                                                                        humantime(false) + " " + text.green + "Redundant publish test (error messaging)" +
                                                                                                        " passed." + text.nocolor
                                                                                                    );
                                                                                                    next();
                                                                                                }
                                                                                            );
                                                                                    }
                                                                                );
                                                                            }
                                                                        }
                                                                    );
                                                            };
                                                        if (errr !== null) {
                                                            return apps.errout(
                                                                {error: errr, name: "biddle_test_publishB_child_statTemp_readJSON_readdir", stdout: stdout, time: humantime(true)}
                                                            );
                                                        }
                                                        if (filelist !== filetest) {
                                                            return diffFiles(
                                                                "biddle_test_publishB_child_statTemp_readJSON_readdir",
                                                                filelist,
                                                                filetest
                                                            );
                                                        }
                                                        console.log(
                                                            humantime(false) + " " + text.green + "List of files generated by publish is co" +
                                                            "rrect." + text.nocolor
                                                        );
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
                                                    }
                                                );
                                            return stdout;
                                        }
                                    );
                            }
                        );
                }
            );
        };
        phases.remove          = function biddle_test_remove() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Remove tests");
            node.child(
                childcmd + "remove " + testpath + node.path.sep + "biddletesta.js childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_remove_child(er, stdout, stder) {
                    var removefile = testpath + node.path.sep + "biddletesta.js",
                        removetest = "biddle removed " + text.red + text.bold + "0" + text.none + " dir" +
                                "ectories, " + text.red + text.bold + "1" + text.none + " files, " + text.red +
                                text.bold + "0" + text.none + " symbolic links, and " + text.red + text.bold +
                                "0" + text.none + " other types at " + text.red + text.bold + "23,177" + text.none +
                                " bytes.\nRemoved " + text.cyan + removefile + text.nocolor;
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_remove_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_remove_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout.replace(/(\s+)$/, "");
                    if (stdout !== removetest) {
                        return diffFiles("biddle_test_remove_child", stdout, removetest);
                    }
                    node
                        .fs
                        .stat(removefile, function biddle_test_remove_child_stat(ers) {
                            if (ers === null || ers.toString().indexOf("no such file for directory") > 0) {
                                return apps.errout(
                                    {error: "remove test failed as file is still present", name: "biddle_test_remove_child_stat", stdout: stdout, time: humantime(true)}
                                );
                            }
                            console.log(
                                humantime(false) + " " + text.green + "remove test passed." + text.nocolor
                            );
                            next();
                        });
                }
            );
        };
        phases.republish       = function biddle_test_republish() {
            var packpath = data.abspath + "test" + node.path.sep + "biddletesta" + node.path.sep + "pac" +
                    "kage.json";
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Republish tests");
            node
                .fs
                .readFile(packpath, function biddle_test_republish_read(rfer, packjson) {
                    var pack = JSON.parse(packjson),
                        ver  = pack
                            .version
                            .split(".");
                    if (rfer !== null) {
                        return apps.errout(
                            {error: rfer, name: "biddle_test_republish_read", stdout: "", time: humantime(true)}
                        );
                    }
                    if (ver[ver.length - 1] === "9999") {
                        ver[ver.length - 1] = "0000";
                    } else {
                        ver[ver.length - 1] = String(Number(ver[ver.length - 1]) + 1);
                    }
                    pack.version = ver.join(".");
                    apps.writeFile(
                        JSON.stringify(pack),
                        packpath,
                        function biddle_test_republish_read_write() {
                            var pubdirs = data
                                .abspath
                                .split(node.path.sep);
                            pubdirs.pop();
                            console.log(
                                humantime(false) + " " + text.green + "version updated for test" + node.path.sep +
                                "biddletesta to:" + text.nocolor + " 99.99." + ver[ver.length - 1]
                            );
                            node.child(childcmd + "publish " + packpath.replace(
                                node.path.sep + "package.json",
                                ""
                            ), {
                                cwd: pubdirs.join(node.path.sep)
                            }, function biddle_test_republish_read_write_publish(er, stdout, stder) {
                                var flag     = {
                                        index  : false,
                                        publish: false,
                                        rdirs  : false
                                    },
                                    complete = function () {
                                        var fkeys = Object.keys(flag),
                                            a     = fkeys.length - 1;
                                        do {
                                            if (flag[fkeys[a]] === false) {
                                                return;
                                            }
                                            a = a - 1;
                                        } while (a > -1);
                                        next();
                                    };
                                if (er !== null) {
                                    return apps.errout(
                                        {error: er, name: "biddle_test_republish_read_write_publish", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (stder !== null && stder !== "") {
                                    return apps.errout(
                                        {error: stder, name: "biddle_test_republish_read_write_publish", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                node
                                    .fs
                                    .readdir(
                                        data.abspath + "publications" + node.path.sep + "biddletesta",
                                        function biddle_test_republish_read_write_publish_readDir(der, files) {
                                            if (der !== null) {
                                                return apps.errout(
                                                    {error: der, name: "biddle_test_republish_read_write_publish_readDir", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            if (files.length !== 22) {
                                                return apps.errout({
                                                    error : "Expected 22 files in the published directory, but instead there are " +
                                                            files.length + "\r\n* " + files.join("\r\n* "),
                                                    name  : "biddle_test_republish_read_write_publish_readDir",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green + "20 files in publications" + node.path.sep +
                                                "biddletesta" + text.nocolor
                                            );
                                            flag.rdirs = true;
                                            complete();
                                        }
                                    );
                                node
                                    .fs
                                    .readFile(
                                        data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep +
                                                "index.xhtml",
                                        function biddle_test_republish_read_write_publish_readIndex(ier, file) {
                                            var index = "",
                                                trs   = [];
                                            if (ier !== null) {
                                                return apps.errout(
                                                    {error: ier, name: "biddle_test_republish_read_write_publish_readIndex", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            index = (typeof file === "string")
                                                ? file
                                                : file.toString();
                                            index = index.replace(/99\.99\.\d{4}/g, "99.99.xxxx");
                                            trs   = index.split("<td>99.99.xxxx</td>");
                                            if (trs.length !== 10) {
                                                return apps.errout({
                                                    error : "Expected 9 zip files in index.xhtml, but there are " + (
                                                        trs.length - 1
                                                    ),
                                                    name  : "biddle_test_republish_read_write_publish_readIndex",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green + "9 entries in publications" + node.path.sep +
                                                "biddletesta" + node.path.sep + "index.xhtml" + text.nocolor
                                            );
                                            flag.index = true;
                                            complete();
                                        }
                                    );
                                node
                                    .fs
                                    .readFile(
                                        data.abspath + "published.json",
                                        function biddle_test_republish_read_write_publish_readPublished(per, file) {
                                            var pub = {};
                                            if (per !== null) {
                                                return apps.errout(
                                                    {error: per, name: "biddle_test_republish_read_write_publish_readPublished", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            pub = JSON.parse(file);
                                            if (pub.biddletesta.versions.length !== 2) {
                                                return apps.errout({
                                                    error : "Expected (published.json).biddletesta.versions of published.json to have two v" +
                                                            "ersion numbers",
                                                    name  : "biddle_test_republish_read_write_publish_readPublished",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green + "(published.json).biddletesta.versions ha" +
                                                "s two version numbers" + text.nocolor
                                            );
                                            if (pub.biddletesta.directory !== data.abspath + "publications" + node.path.sep + "biddletesta" + node.path.sep) {
                                                return diffFiles(
                                                    "biddle_test_republish_read_write_publish_readPublished",
                                                    pub.biddletesta.directory,
                                                    data.abspath + "publications" + node.path.sep + "biddletesta/"
                                                );
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green + "(published.json).biddletesta.directory i" +
                                                "s correct location" + text.nocolor
                                            );
                                            flag.publish = true;
                                            complete();
                                        }
                                    );
                            });
                        }
                    );
                });
        };
        phases.uninstall       = function biddle_test_uninstall() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Uninstall tests");
            node.child(
                childcmd + "uninstall biddletesta childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_uninstall_child(er, stdout, stder) {
                    var uninsttest = "App " + text.cyan + "biddletesta" + text.nocolor + " is unins" +
                            "talled.";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_uninstall_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_uninstall_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout.replace(/(\s+)$/, "");
                    if (stdout !== uninsttest) {
                        return diffFiles("biddle_test_uninstall_child", stdout, uninsttest);
                    }
                    if (data.installed.biddletesta !== undefined) {
                        return apps.errout(
                            {error: "biddletesta property not removed from data.installed object", name: "biddle_test_uninstall_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    console.log(
                        humantime(false) + " " + text.green +
                        "biddletesta removed from installed.json." + text.nocolor
                    );
                    node
                        .fs
                        .stat(
                            data.abspath + "applications" + node.path.sep + "biddletesta",
                            function biddle_test_uninstall_child_stat(err, stat) {
                                if (err !== null && err.toString().indexOf("no such file or directory") < 0) {
                                    return apps.errout(
                                        {error: err, name: "biddle_test_uninstall_child_stat", time: humantime(true)}
                                    );
                                }
                                if (stat !== undefined && stat.isDirectory() === true) {
                                    return apps.errout({
                                        error : "applications" + node.path.sep + "biddletesta directory not deleted by uninstal" +
                                                "l command",
                                        name  : "biddle_test_uninstall_child_stat",
                                        stdout: stdout,
                                        time  : humantime(true)
                                    });
                                }
                                if (err.toString().indexOf("no such file or directory") > 0) {
                                    node
                                        .fs
                                        .readFile(
                                            data.abspath + "installed.json",
                                            function biddle_test_uninstall_child_stat_readfile(erf, filedata) {
                                                var jsondata = {};
                                                if (erf !== null && erf !== undefined) {
                                                    return apps.errout(
                                                        {error: erf, name: "biddle_test_uninstall_child_stat_readfile", stdout: stdout, time: humantime(true)}
                                                    );
                                                }
                                                jsondata = JSON.parse(filedata);
                                                if (jsondata.biddletesta !== undefined) {
                                                    return apps.errout(
                                                        {error: "biddletesta property still present in installed.json file", name: "biddle_test_uninstall_child_stat_readfile", stdout: stdout, time: humantime(true)}
                                                    );
                                                }
                                                console.log(
                                                    humantime(false) + " " + text.green + "uninstall test passed." + text.nocolor
                                                );
                                                node.child(
                                                    childcmd + "uninstall biddletesta childtest",
                                                    {
                                                        cwd: data.abspath
                                                    },
                                                    function biddle_test_uninstall_child_stat_readfile_again(erx, stdoutx, stderx) {
                                                        var uninstagain = "Attempted to uninstall " + text.cyan + "biddletesta" +
                                                                    text.nocolor + " which is " + text.bold + text.red + "absent" + text.none + " f" +
                                                                    "rom the list of installed applications. Try using the command " + text.green +
                                                                    "biddle list installed" + text.nocolor + ".",
                                                            stack       = [];
                                                        if (erx !== null) {
                                                            if (typeof erx.stack === "string") {
                                                                stack = erx
                                                                    .stack
                                                                    .split(" at ");
                                                            }
                                                            if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:202:12)") < 0) {
                                                                return apps.errout(
                                                                    {error: erx, name: "biddle_test_uninstall_child_stat_readfile_again", stdout: stdout, time: humantime(true)}
                                                                );
                                                            }
                                                        }
                                                        if (stderx !== null && stderx !== "") {
                                                            return apps.errout(
                                                                {error: stderx, name: "biddle_test_uninstall_child_stat_readfile_again", stdout: stdout, time: humantime(true)}
                                                            );
                                                        }
                                                        stdoutx = stdoutx.replace(/(\s+)$/, "");
                                                        if (stdoutx !== uninstagain) {
                                                            return diffFiles(
                                                                "biddle_test_uninstall_child_stat_readfile_again",
                                                                stdoutx,
                                                                uninstagain
                                                            );
                                                        }
                                                        console.log(
                                                            humantime(false) + " " + text.green + "Redundant uninstall test (error messagin" +
                                                            "g) passed." + text.nocolor
                                                        );
                                                        next();
                                                    }
                                                );
                                            }
                                        );
                                } else {
                                    return apps.errout({
                                        error : "directory applications" + node.path.sep + "biddletesta changed to something el" +
                                                "se and not deleted",
                                        name  : "biddle_test_uninstall_child_stat",
                                        stdout: stdout,
                                        time  : humantime(true)
                                    });
                                }
                            }
                        );
                }
            );
        };
        phases.unpublishAll    = function biddle_test_unpublishAll() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Unpublish All tests");
            node.child(
                childcmd + "unpublish biddletesta all childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_unpublishAll_child(er, stdout, stder) {
                    var unpubtest = "All versions of app " + text.cyan + "biddletesta" + text.nocolor +
                            " are unpublished.";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_unpublishAll_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_unpublishAll_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout.replace(/(\s+)$/, "");
                    if (stdout !== unpubtest) {
                        return diffFiles("biddle_test_unpublishAll_child", stdout, unpubtest);
                    }
                    console.log(
                        humantime(false) + " " + text.green +
                        "biddletesta removed from published.json." + text.nocolor
                    );
                    node
                        .fs
                        .stat(
                            data.abspath + "publications" + node.path.sep + "biddletesta",
                            function biddle_test_unpublishAll_child_stat(err, stat) {
                                if (err !== null && err.toString().indexOf("no such file or directory") < 0) {
                                    return apps.errout(
                                        {error: err, name: "biddle_test_unpublishAll_child_stat", time: humantime(true)}
                                    );
                                }
                                if (stat !== undefined && stat.isDirectory() === true) {
                                    return apps.errout({
                                        error : "publications" + node.path.sep + "biddletesta directory not deleted by unpublis" +
                                                "h command",
                                        name  : "biddle_test_unpublishAll_child_stat",
                                        stdout: stdout,
                                        time  : humantime(true)
                                    });
                                }
                                if (err.toString().indexOf("no such file or directory") > 0) {
                                    node
                                        .fs
                                        .readFile(
                                            data.abspath + "published.json",
                                            function biddle_test_unpublishAll_child_stat_readfile(erf, filedata) {
                                                var jsondata = {};
                                                if (erf !== null && erf !== undefined) {
                                                    return apps.errout(
                                                        {error: erf, name: "biddle_test_unpublishAll_child_stat_readfile", stdout: stdout, time: humantime(true)}
                                                    );
                                                }
                                                jsondata = JSON.parse(filedata);
                                                if (jsondata.biddletesta !== undefined) {
                                                    return apps.errout(
                                                        {error: "biddletesta property still present in published.json file", name: "biddle_test_unpublishAll_child_stat_readfile", stdout: stdout, time: humantime(true)}
                                                    );
                                                }
                                                console.log(
                                                    humantime(false) + " " + text.green + "unpublish all test passed." + text.nocolor
                                                );
                                                node.child(
                                                    childcmd + "unpublish biddletesta all childtest",
                                                    {
                                                        cwd: data.abspath
                                                    },
                                                    function biddle_test_unpublishAll_child_stat_readfile_again(erx, stdoutx, stderx) {
                                                        var unpubagain = "Attempted to unpublish " + text.cyan + "biddletesta" + text.nocolor + " w" +
                                                                    "hich is " + text.bold + text.red + "absent" + text.none + " from the list of p" +
                                                                    "ublished applications. Try using the command " + text.green + "biddle list pub" +
                                                                    "lished" + text.nocolor + ".",
                                                            stack      = [];
                                                        if (erx !== null) {
                                                            if (typeof erx.stack === "string") {
                                                                stack = erx
                                                                    .stack
                                                                    .split(" at ");
                                                            }
                                                            if (stack.length < 1 || stack[1].indexOf("ChildProcess.exithandler (child_process.js:202:12)") < 0) {
                                                                return apps.errout(
                                                                    {error: erx, name: "biddle_test_unpublishAll_child_stat_readfile_again", stdout: stdout, time: humantime(true)}
                                                                );
                                                            }
                                                        }
                                                        if (stderx !== null && stderx !== "") {
                                                            return apps.errout(
                                                                {error: stderx, name: "biddle_test_unpublishAll_child_stat_readfile_again", stdout: stdout, time: humantime(true)}
                                                            );
                                                        }
                                                        stdoutx = stdoutx.replace(/(\s+)$/, "");
                                                        if (stdoutx !== unpubagain) {
                                                            return diffFiles(
                                                                "biddle_test_unpublishAll_child_stat_readfile_again",
                                                                stdoutx,
                                                                unpubagain
                                                            );
                                                        }
                                                        console.log(
                                                            humantime(false) + " " + text.green + "Redundant unpublish all test (error mess" +
                                                            "aging) passed." + text.nocolor
                                                        );
                                                        next();
                                                    }
                                                );
                                            }
                                        );
                                } else {
                                    return apps.errout({
                                        error : "directory publications" + node.path.sep + "biddletesta changed to something el" +
                                                "se and not deleted",
                                        name  : "biddle_test_unpublishAll_child_stat",
                                        stdout: stdout,
                                        time  : humantime(true)
                                    });
                                }
                            }
                        );
                }
            );
        };
        phases.unpublishB      = function biddle_test_unpublishB() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Unpublish biddletestb");
            node.child(
                childcmd + "unpublish biddletestb all childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_unpublishB_child(er, stdout, stder) {
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_unpublishB_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_unpublishB_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    console.log(humantime(false) + " " + text.green + "biddletestb is unpublished." + text.nocolor);
                    next();
                }
            );
        };
        phases.unpublishLatest = function biddle_test_unpublishLatest() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Unpublish Latest tests");
            node.child(
                childcmd + "unpublish biddletesta latest childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_unpublishLatest_child(er, stdout, stder) {
                    var unpubtest = "\nVersion " + text.bold + text.red + "99.99.xxxx" + text.none +
                            " of app " + text.cyan + "biddletesta" + text.nocolor + " is unpublished.";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_unpublishLatest_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_unpublishLatest_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout.replace(/(\s+)$/, "");
                    stdout = stdout.replace(/\r\n/g, "\n");
                    stdout = stdout.replace(/99\.99\.\d\d\d\d/, "99.99.xxxx");
                    if (stdout !== unpubtest) {
                        return diffFiles("biddle_test_unpublishLatest_child", stdout, unpubtest);
                    }
                    console.log(
                        humantime(false) + " " + text.green +
                        "biddletesta removed from published.json." + text.nocolor
                    );
                    node
                        .fs
                        .stat(
                            data.abspath + "publications" + node.path.sep + "biddletesta",
                            function biddle_test_unpublishLatest_child_stat(err, stat) {
                                if (err !== null) {
                                    return apps.errout(
                                        {error: err, name: "biddle_test_unpublishLatest_child_stat", time: humantime(true)}
                                    );
                                }
                                if (stat === undefined) {
                                    return apps.errout({
                                        error: "Error reading publications" + node.path.sep + "biddletesta",
                                        name : "biddle_test_unpublishLatest_child_stat",
                                        time : humantime(true)
                                    });
                                }
                                node
                                    .fs
                                    .readFile(
                                        data.abspath + "published.json",
                                        function biddle_test_unpublishLatest_child_stat_readfile(erf, filedata) {
                                            var jsondata = {};
                                            if (erf !== null && erf !== undefined) {
                                                return apps.errout(
                                                    {error: erf, name: "biddle_test_unpublishLatest_child_stat_readfile", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            jsondata = JSON.parse(filedata);
                                            if (jsondata.biddletesta === undefined) {
                                                return apps.errout(
                                                    {error: "biddletesta property prematurely deleted from published.json file", name: "biddle_test_unpublishLatest_child_stat_readfile", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green + "unpublish latest test passed." + text.nocolor
                                            );
                                            next();
                                        }
                                    );
                            }
                        );
                }
            );
        };
        phases.unzip           = function biddle_test_unzip() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Unzip tests");
            node.child(
                childcmd + "unzip " + data.abspath + "unittest" + node.path.sep + "biddletesta." +
                        "zip " + data.abspath + "unittest" + node.path.sep + "unzip childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_unzip_child(er, stdout, stder) {
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_unzip_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_unzip_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    node
                        .fs
                        .stat(
                            testpath + node.path.sep + "unzip" + node.path.sep + "biddletesta.js",
                            function biddle_test_unzip_child_stat(err, stat) {
                                if (err !== null) {
                                    return apps.errout(
                                        {error: err, name: "biddle_test_unzip_child_stat", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (stat.size < 10000) {
                                    return apps.errout({
                                        error : text.red + "unzip test failed." + text.nocolor,
                                        name  : "biddle_test_unzip_child_stat",
                                        stdout: stdout,
                                        time  : humantime(true)
                                    });
                                }
                                console.log(
                                    humantime(false) + " " + text.green + "biddletesta.js unzipped." + text.nocolor
                                );
                                node
                                    .fs
                                    .readdir(
                                        testpath + node.path.sep + "unzip",
                                        function biddle_test_unzip_child_stat_readDir(erd, files) {
                                            var count = 5;
                                            if (erd !== null) {
                                                return apps.errout(
                                                    {error: erd, name: "biddle_test_unzip_child_stat_readDir", stdout: stdout, time: humantime(true)}
                                                );
                                            }
                                            if (files.length !== count) {
                                                return apps.errout({
                                                    error : "Expected " + count + " items unzipped, but there are " + files.length + ".",
                                                    name  : "biddle_test_unzip_child_stat_readDir",
                                                    stdout: stdout,
                                                    time  : humantime(true)
                                                });
                                            }
                                            console.log(
                                                humantime(false) + " " + text.green + count + " items unzipped." + text.nocolor
                                            );
                                            console.log(
                                                humantime(false) + " " + text.green + "unzip test passed." + text.nocolor
                                            );
                                            next();
                                        }
                                    );
                                return stdout;
                            }
                        );
                }
            );
        };
        phases.update          = function biddle_test_update() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Update tests");
            node.child(childcmd + "update biddletesta childtest", {cwd: data.abspath}, function biddle_test_update_child(er, stdout, stder) {
                if (er !== null) {
                    return apps.errout(
                        {error: er, name: "biddle_test_update_child", stdout: stdout, time: humantime(true)}
                    );
                }
                if (stder !== null && stder !== "") {
                    return apps.errout(
                        {error: stder, name: "biddle_test_update_child", stdout: stdout, time: humantime(true)}
                    );
                }
                if (stdout.indexOf(text.yellow + "biddletesta" + text.nocolor + " updated!") < 0) {
                    return apps.errout({
                        error : "update test failed.",
                        name  : "biddle_test_update_child",
                        stdout: stdout,
                        time  : humantime(true)
                    });
                }
                console.log(humantime(false) + " " + text.green + "Update test passed." + text.nocolor);
                next();
            });
        };
        phases.zip             = function biddle_test_zip() {
            phasenumb = phasenumb + 1;
            console.log(phasenumb + ". Zip tests");
            node.child(
                childcmd + "zip " + data.abspath + "test" + node.path.sep + "biddletesta " +
                        data.abspath + "unittest childtest",
                {
                    cwd: data.abspath
                },
                function biddle_test_zip_child(er, stdout, stder) {
                    var ziptest = "Zip file written: unittest" + node.path.sep +
                            "biddletesta.zip";
                    if (er !== null) {
                        return apps.errout(
                            {error: er, name: "biddle_test_zip_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    if (stder !== null && stder !== "") {
                        return apps.errout(
                            {error: stder, name: "biddle_test_zip_child", stdout: stdout, time: humantime(true)}
                        );
                    }
                    stdout = stdout
                        .replace(/(\s+)$/, "")
                        .replace(data.abspath, "");
                    if (stdout !== ziptest) {
                        return diffFiles("biddle_test_zip_child", stdout, ziptest);
                    }
                    node
                        .fs
                        .stat(
                            testpath + node.path.sep + "biddletesta.zip",
                            function biddle_test_zip_stat(err, stat) {
                                if (err !== null) {
                                    return apps.errout(
                                        {error: err, name: "biddle_test_zip_stat", stdout: stdout, time: humantime(true)}
                                    );
                                }
                                if (stat.size > 20000) {
                                    return apps.errout({
                                        error : "Zip file is too large at " + apps.commas(stat.size) + " bytes.",
                                        name  : "biddle_test_zip_stat",
                                        stdout: stdout,
                                        time  : humantime(true)
                                    });
                                }
                                console.log(
                                    humantime(false) + " " + text.green + "zip test passed." + text.nocolor + " Fil" +
                                    "e " + data.abspath + "unittest" + node.path.sep +
                                    "biddletesta.zip written at " + text.bold + text.green + apps.commas(stat.size) +
                                    text.none + " bytes."
                                );
                                next();
                            }
                        );
                }
            );
        };
        next();
    };
    apps.uninstall   = function biddle_uninstall(fromTest) {
        var app = data.installed[data.input[2]];
        if (app === undefined && fromTest === false) {
            return console.log(
                "Attempted to uninstall " + text.cyan + data.input[2] + text.nocolor + " which " +
                "is " + text.bold + text.red + "absent" + text.none + " from the list of instal" +
                "led applications. Try using the command " + text.green +
                "biddle list installed" + text.nocolor + "."
            );
        }
        apps.remove(app.location, function biddle_uninstall_remove() {
            if (fromTest === true) {
                delete data.installed.biddletestb;
                delete data.installed.biddletesta;
                apps.remove(
                    data.abspath + "applications" + node.path.sep + "biddletestb",
                    function biddle_uninstall_removeTest() {
                        return true;
                    }
                );
            } else {
                delete data.installed[data.input[2]];
            }
            apps.writeFile(
                JSON.stringify(data.installed),
                data.abspath + "installed.json",
                function biddle_uninstall_remove_writeFile() {
                    data.input[3] = "remove";
                    if (data.platform !== "win32") {
                        apps.global(app.location + node.path.sep);
                    }
                    if (fromTest === false) {
                        if (data.internal === true) {
                            if (data.installed.internal === undefined || Object.keys(data.installed.internal).length < 1) {
                                apps.remove(
                                    __dirname + node.path.sep + "internal",
                                    function biddle_uninstall_remove_writeFile_removeInternal() {
                                        return;
                                    }
                                );
                            }
                            return console.log(
                                text.bold + text.red + "Internal" + text.none + " app " + text.cyan + data.input[2] +
                                text.nocolor + " is uninstalled."
                            );
                        }
                        console.log(
                            "App " + text.cyan + data.input[2] + text.nocolor + " is uninstalled."
                        );
                    }
                }
            );
        });
    };
    apps.unpublish   = function biddle_unpublish(fromTest) {
        var app    = {},
            ver    = "",
            vers   = [],
            latest = false,
            vert   = false,
            a      = 0;
        if (data.input[2] === undefined) {
            if (fromTest === true) {
                return apps.errout({
                    error: "Unpublish from biddle test failed. " + data.input[2] + " is not present in dat" +
                            "a.published.",
                    name : "biddle_unpublish"
                });
            }
            return console.log(
                "Attempted to unpublish " + text.cyan + data.input[2] + text.nocolor + " which " +
                "is " + text.bold + text.red + "absent" + text.none + " from the list of publis" +
                "hed applications. Try using the command " + text.green +
                "biddle list published" + text.nocolor + "."
            );
        }
        data.input[2] = apps.sanitizef(data.input[2]);
        app           = data.published[data.input[2]];
        if (app === undefined) {
            if (fromTest === true) {
                return apps.errout({
                    error: "Unpublish from biddle test failed. " + data.input[2] + " is not present in dat" +
                            "a.published.",
                    name : "biddle_unpublish"
                });
            }
            return console.log(
                "Attempted to unpublish " + text.cyan + data.input[2] + text.nocolor + " which " +
                "is " + text.bold + text.red + "absent" + text.none + " from the list of publis" +
                "hed applications. Try using the command " + text.green +
                "biddle list published" + text.nocolor + "."
            );
        }
        if (data.input[3] === undefined) {
            return apps.errout(
                {error: "Please specify a version or \"all\" for all versions.", name: "biddle_unpublish", stdout: "", time: ""}
            );
        }
        ver = apps.sanitizef(data.input[3]);
        if (ver.toLowerCase() === "all") {
            ver = "all";
        } else if (ver.toLowerCase() === "latest") {
            ver = app.latest;
        }
        vers = data
            .published[data.input[2]]
            .versions;
        if (ver !== "all") {
            a = vers.length;
            do {
                a = a - 1;
                if (vers[a] === ver) {
                    vers.splice(a, 1);
                    vert = true;
                    break;
                }
            } while (a > 0);
            if (vert === false) {
                return apps.errout({
                    error: "Specified version, " + text.bold + text.red + ver + text.none + ", is not a pu" +
                            "blished version of " + text.cyan + data.input[2] + text.nocolor,
                    name : "biddle_unpublish"
                });
            }
            if (app.latest === ver) {
                latest = true;
            }
        }
        if (ver === "all" || vers.length === 0) {
            apps.remove(app.directory, function biddle_unpublish_remove() {
                var str = "";
                delete data.published[data.input[2]];
                str = JSON.stringify(data.published);
                apps.writeFile(
                    str,
                    data.abspath + "published.json",
                    function biddle_unpublish_remove_writeFile() {
                        if (fromTest === false) {
                            console.log(
                                "All versions of app " + text.cyan + data.input[2] + text.nocolor + " are unpub" +
                                "lished."
                            );
                        }
                    }
                );
            });
        } else {
            node
                .fs
                .readdir(app.directory, function biddle_unpublish_readdir(er, files) {
                    var later   = (latest === true)
                            ? app.versions[app.versions.length - 1]
                            : app.latest,
                        destroy = function biddle_unpublish_readdir_destroy() {
                            var aa  = files.length,
                                rem = function biddle_unpublish_readdir_destroy_rem() {
                                    apps.remove(
                                        app.directory + files[aa],
                                        function biddle_unpublish_readdir_destory_remove() {
                                            return true;
                                        }
                                    );
                                };
                            do {
                                aa = aa - 1;
                                if (files[aa].indexOf("_" + ver + ".zip") === files[aa].length - (ver.length + 5) || files[aa].indexOf(
                                    "_" + ver + ".hash"
                                ) === files[aa].length - (ver.length + 6)) {
                                    rem();
                                } else if (latest === true && files[aa].length > 11 && (files[aa].indexOf("_latest.zip") === files[aa].length - 11 || files[aa].indexOf("_latest.hash") === files[aa].length - 12)) {
                                    rem();
                                }
                            } while (aa > 0);
                            node
                                .fs
                                .readFile(
                                    app.directory + "filedata.json",
                                    "utf8",
                                    function biddle_unpublish_readdir_destory_readFileData(err, filedata) {
                                        var parsed = {},
                                            bb     = 0;
                                        if (err !== null && err !== undefined) {
                                            return apps.errout(
                                                {error: err, name: "biddle_unpublish_readdir_destory_readFileData"}
                                            );
                                        }
                                        parsed = JSON
                                            .parse(filedata)
                                            .filedata;
                                        bb     = parsed.length;
                                        do {
                                            bb = bb - 1;
                                            if (parsed[bb].filename.indexOf("_" + ver + ".zip") === parsed[bb].filename.length - (ver.length + 5) || parsed[bb].filename.indexOf(
                                                "_" + ver + ".hash"
                                            ) === parsed[bb].filename.length - (ver.length + 6)) {
                                                parsed.splice(bb, 1);
                                            } else if (latest === true && (parsed[bb].filename.indexOf("_latest.zip") === parsed[bb].filename.length - 11 || parsed[bb].filename.indexOf("_latest.hash") === parsed[bb].filename.length - 12)) {
                                                parsed.splice(bb, 1);
                                            }
                                        } while (bb > 0);
                                        console.log();
                                        apps.writeFile(
                                            JSON.stringify({filedata: parsed}),
                                            app.directory + "filedata.json",
                                            function biddle_unpublish_readdir_destory_readFileData_writeFileData() {
                                                node
                                                    .fs
                                                    .readFile(
                                                        app.directory + "index.xhtml",
                                                        "utf8",
                                                        function biddle_unpublish_readdir_destory_readFileData_writeFileData_readIndex(errr, index) {
                                                            var lex = [],
                                                                cc  = 0,
                                                                dd  = 0,
                                                                row = false;
                                                            if (errr !== null && errr !== undefined) {
                                                                return apps.errout(
                                                                    {error: errr, name: "biddle_unpublish_readdir_destory_readFileData_writeFileData_readIndex"}
                                                                );
                                                            }
                                                            lex = index.split("");
                                                            cc  = index.indexOf("</tbody");
                                                            do {
                                                                cc = cc - 1;
                                                                if (lex[cc - 4] === "<" && lex[cc - 3] === "/" && lex[cc - 2] === "t" && lex[cc - 1] === "r" && lex[cc] === ">") {
                                                                    dd  = cc + 1;
                                                                    row = false;
                                                                }
                                                                if (lex[cc] === "." && lex[cc + 1] === "z" && lex[cc + 2] === "i" && lex[cc + 3] === "p" && lex[cc + 4] === "<" && lex[cc + 5] === "/" && lex[cc + 6] === "a" && lex[cc + 7] === ">") {
                                                                    if (latest === true && lex.slice(cc - 7, cc).join("") === "_latest") {
                                                                        row = true;
                                                                    } else if (lex.slice(cc - ver.length, cc).join("") === ver) {
                                                                        row = true;
                                                                    }
                                                                }
                                                                if (lex[cc] === "<" && lex[cc + 1] === "t" && lex[cc + 2] === "r" && lex[cc + 3] === ">" && row === true) {
                                                                    lex.splice(cc, dd - cc);
                                                                }
                                                                if (lex[cc - 5] === "<" && lex[cc - 4] === "t" && lex[cc - 3] === "b" && lex[cc - 2] === "o" && lex[cc - 1] === "d" && lex[cc] === "y") {
                                                                    break;
                                                                }
                                                            } while (cc > 0);
                                                            index = lex.join("");
                                                            if (latest === true) {
                                                                dd = index.indexOf("</a>");
                                                                cc = dd;
                                                                do {
                                                                    cc = cc - 1;
                                                                } while (index.charAt(cc - 1) !== ">");
                                                                lex[0] = index.slice(cc, dd);
                                                                index  = index.replace(data.input[2] + "_latest.zip", lex[0]);
                                                            }
                                                            apps.writeFile(
                                                                index,
                                                                app.directory + "index.xhtml",
                                                                function biddle_unpublish_readdir_destory_readFileData_writeFileData_readIndex_writeIndex() {
                                                                    apps.writeFile(
                                                                        JSON.stringify(data.published),
                                                                        data.abspath + "published.json",
                                                                        function biddle_unpublish_readdir_destory_readFileData_writeFileData_readIndex_writeIndex_writePublished() {
                                                                            if (fromTest === false) {
                                                                                console.log(
                                                                                    "Version " + text.bold + text.red + ver + text.none + " of app " + text.cyan +
                                                                                    data.input[2] + text.nocolor + " is unpublished."
                                                                                );
                                                                            }
                                                                        }
                                                                    );
                                                                }
                                                            );
                                                        }
                                                    );
                                            }
                                        );
                                    }
                                );
                        };
                    if (er !== null) {
                        return apps.errout({error: er, name: "biddle_unpublish_readdir"});
                    }
                    if (latest === true) {
                        data
                            .published[data.input[2]]
                            .latest = later;
                        apps.writeFile(later, app.directory + "latest.txt", destroy);
                    } else {
                        destroy();
                    }
                });
        }
    };
    apps.update      = function biddle_update(app, forceInternal, callback) {
        var inst = {};
        if (forceInternal === true) {
            inst = data.installed.internal[app];
        } else {
            inst = data.installed[app];
        }
        if (inst === undefined && app !== undefined) {
            return apps.errout({
                error: "Update failed, " + text.cyan + app + text.nocolor + " is not installed by bidd" +
                        "le.",
                name : "biddle_update"
            });
        }
        apps.status(app, forceInternal, function biddle_update_statusResponse(status) {
            var zippy  = "";
            if (status === undefined) {
                return;
            }
            if (status.indexOf("matches published version") > 0) {
                console.log(status);
                return callback();
            }
            console.log(status);
            zippy = inst.published;
            if (data.protocoltest.test(inst.published) === true && inst.published.charAt(inst.published.length - 1) !== "/") {
                zippy = zippy + "/"
            } else if (data.protocoltest.test(inst.published) === false && inst.published.charAt(inst.published.length - 1) !== node.path.sep) {
                zippy = zippy + node.path.sep;
            }
            zippy = zippy + app + "_";
            if (inst.variant !== "") {
                zippy = zippy + inst.variant + "_";
            }
            zippy = zippy + "latest.zip";
            apps.install(zippy, callback);
        });
    };
    apps.writeFile   = function biddle_writeFile(fileData, fileName, callback) {
        var callbacker = function biddle_writeFile_callbacker(size) {
                var colored = [];
                if (size > 0 && fileName.replace(data.abspath, "") !== "published.json" && fileName.replace(data.abspath, "") !== "installed.json") {
                    colored                     = fileName.split(node.path.sep);
                    colored[colored.length - 1] = colored[colored.length - 1].replace(
                        "_",
                        "_" + text.bold + text.cyan
                    );
                    if ((/((\.zip)|(\.hash))$/).test(fileName) === true) {
                        console.log(
                            "File " + colored.join(node.path.sep) + text.none + " written at " + text.bold +
                            text.green + apps.commas(size) + text.none + " bytes."
                        );
                    } else {
                        console.log(
                            "File " + colored.join(node.path.sep) + " written at " + text.bold + text.green +
                            apps.commas(size) + text.none + " bytes."
                        );
                    }
                }
                callback(fileData);
            },
            encoding   = (
                typeof fileData !== "string" && ((data.command !== "install" && (/[\u0002-\u0008]|[\u000e-\u001f]/).test(fileData) === true) || (/(\.zip)$/).test(fileName) === true)
            )
                ? "binary"
                : "utf8";
        node
            .fs
            .writeFile(
                fileName,
                fileData,
                encoding,
                function biddle_writeFile_callback(err) {
                    if (err !== null) {
                        if (data.platform !== "win32" && data.command === "global" && err.toString().indexOf("EACCES: permission denied")) {
                            return apps.errout({
                                error: err.toString() + "\n" + text.bold + text.red + "This command requires sudo acce" +
                                        "ss." + text.none + " Please try 'sudo node biddle global'.",
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
                }
            );
    };
    apps.version     = function biddle_version() {
        if (data.input[2] === undefined) {
            apps.getpjson(data.abspath + "package.json", function biddle_version_vers() {
                console.log(
                    text.cyan + "biddle" + text.nocolor + " - " + data.packjson.version
                );
            });
        } else {
            if (data.installed[data.input[2]] === undefined) {
                apps.errout({
                    error: text.red + data.input[2] + text.nocolor + " is not installed by biddle",
                    name : "biddle_version"
                });
            } else {
                console.log(
                    text.cyan + data.input[2] + text.nocolor + " - " + data.installed[data.input[2]].version
                );
            }
        }
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
            childfunc   = function biddle_zip_childfunc(zipfilename, zipcmd) {
                node.child(zipcmd, {
                    cwd: zipdir
                }, function biddle_zip_childfunc_child(err, stdout, stderr) {
                    if (err !== null && stderr.toString().indexOf("No such file or directory") < 0) {
                        return apps.errout({error: err, name: "biddle_zip_childfunc_child"});
                    }
                    if (stderr !== null && stderr.replace(/\s+/, "") !== "" && stderr.indexOf("No such file or directory") < 0) {
                        return apps.errout({error: stderr, name: "biddle_zip_childfunc_child"});
                    }
                    if (data.command === "test" && data.internal === true) {
                        data.address.target = zipdir + node.path.sep;
                    }
                    callback(zipfilename);
                    return stdout;
                });
            };
        if (data.command === "publish" || data.command === "zip") {
            if (data.command === "zip") {
                zipfile = data.address.target + zippack.fileName + ".zip";
            } else {
                zipfile = data.address.target + data.packjson.name + variantName + "_" + apps.sanitizef(
                    data.packjson.version
                ) + ".zip";
            }
            if (data.command === "publish") {
                cmd = cmds.zip(zipfile, "");
                apps.makedir(data.address.target, function biddle_zip_makepubdir() {
                    zipdir = zippack.location;
                    if (data.latestVersion === true) {
                        latestfile = zipfile.replace(data.packjson.version + ".zip", "latest.zip");
                        latestcmd  = cmd.replace(data.packjson.version + ".zip", "latest.zip");
                        apps.remove(latestfile, function biddle_zip_makepubdir_removeFile() {
                            childfunc(latestfile, latestcmd);
                        });
                    }
                    childfunc(zipfile, cmd);
                });
            } else {
                node
                    .fs
                    .stat(data.input[2], function biddle_zip_stat(ers, stats) {
                        if (ers !== null) {
                            return apps.errout({error: ers, name: "biddle_zip_stat"});
                        }
                        if (stats.isDirectory() === true) {
                            cmd = cmds.zip(zipfile, "");
                            apps.makedir(data.input[2], function biddle_zip_stat_makedir() {
                                zipdir = data.input[2];
                                childfunc(zipfile, cmd);
                            });
                        } else {
                            zipdir = (function biddle_zip_stat_zipdir() {
                                var dirs = data
                                    .input[2]
                                    .split(node.path.sep);
                                cmd = cmds.zip(zipfile, dirs.pop());
                                return apps.relToAbs(dirs.join(node.path.sep), data.cwd);
                            }());
                            childfunc(zipfile, cmd);
                        }
                    });
            }
        }
        if (data.command === "install" || data.command === "test" || data.command === "unzip" || data.command === "update") {
            if (data.command === "test" && data.internal === true) {
                zipdir = zippack.fileName;
                zipdir = zipdir.replace(/((_latest)?\.zip)$/i, "");
                if (zipdir.indexOf("_") > 0) {
                    zipdir = zipdir.slice(0, zipdir.indexOf("_"));
                }
                zipdir = __dirname + node.path.sep + "internal" + node.path.sep + zipdir;
                cmd    = cmds.unzip(data.address.downloads + zippack.fileName, zipdir);
                apps.makedir(zipdir, function biddle_zip_unzip() {
                    childfunc(data.address.downloads + zippack.fileName, cmd);
                });
            } else {
                apps.remove(data.address.target, function biddle_zip_remove() {
                    if (data.command === "unzip") {
                        cmd = cmds.unzip(data.input[2], data.address.target);
                    } else {
                        cmd = cmds.unzip(
                            data.address.downloads + zippack.fileName,
                            data.address.target
                        );
                    }
                    apps.makedir(data.address.target, function biddle_zip_remove_unzip() {
                        childfunc(data.input[2], cmd);
                    });
                });
            }
        }
    };
    (function biddle_init() {
        var status    = {
                biddlerc : false,
                installed: false,
                published: false
            },
            valuetype = "",
            start     = function biddle_init_start() {
                (function biddle_init_start_target() {
                    var dir = [],
                        app = "";
                    if (typeof data.input[3] === "string" && (data.command !== "install" || data.internal === false)) {
                        data.address.target = apps.relToAbs(
                            data.input[3].replace(/((\\|\/)+)$/, ""),
                            data.cwd
                        ) + node.path.sep;
                    } else if (data.command === "publish") {
                        data.address.target = data.address.publications;
                    } else if (data.command === "install" || data.command === "update") {
                        dir = (data.protocoltest.test(data.input[2]) === true)
                            ? data
                                .input[2]
                                .split("/")
                            : data
                                .input[2]
                                .split(node.path.sep);
                        app = dir[dir.length - 1];
                        if (data.internal === true) {
                            data.address.target = __dirname + node.path.sep + "internal" + node.path.sep +
                                    apps.sanitizef(app.slice(0, app.indexOf("_"))) + node.path.sep;
                        } else if (app.indexOf("_") > -1) {
                            data.address.target = data.address.applications + apps.sanitizef(
                                app.slice(0, app.indexOf("_"))
                            ) + node.path.sep;
                        } else {
                            data.address.target = data.address.applications + apps.sanitizef(app) + node.path.sep;
                        }
                    } else {
                        data.address.target = data.address.downloads;
                    }
                }());
                if (data.command === "help" || data.command === "" || data.command === undefined || data.command === "?") {
                    if (data.command === "") {
                        data.command  = "help";
                        data.input[1] = "help";
                        data.input[2] = "80";
                    }
                    apps.markdown();
                } else if (isNaN(data.command) === false) {
                    data.input[1] = "markdown";
                    data.input[2] = data.command;
                    data.command  = "markdown";
                    apps.markdown();
                } else if (commands[data.command] === undefined && commands[data.command + "s"] === undefined) {
                    apps.commands();
                    console.log("");
                    apps.errout({
                        error: "Unrecognized command: " + text.red + text.bold + data.command + text.none,
                        name : "biddle_init_start"
                    });
                } else {
                    if (data.input[2] === undefined && data.command !== "command" && data.command !== "global" && data.command !== "list" && data.command !== "status" && data.command !== "update" && data.command !== "test" && data.command !== "version") {
                        if (data.command === "copy" || data.command === "hash" || data.command === "markdown" || data.command === "remove" || data.command === "unzip" || data.command === "zip") {
                            valuetype = "path to a local file or directory";
                        } else if (data.command === "get" || data.command === "install" || data.command === "publish") {
                            valuetype = "URL address for a remote resource or path to a local file";
                        } else if (data.command === "uninstall" || data.command === "unpublish") {
                            valuetype = "known application name";
                        }
                        return apps.errout({
                            error: "Command " + text.green + data.command + text.nocolor + " requires a " +
                                    valuetype + ".",
                            name : "biddle_init_start"
                        });
                    }
                    if (data.input[3] === undefined && data.command === "copy") {
                        return apps.errout({
                            error: "Command " + text.green + data.command + text.nocolor + " requires a destinatio" +
                                    "n directory.",
                            name : "biddle_init_start"
                        });
                    }
                    if (data.command === "command" || data.command === "commands") {
                        apps.commands();
                    } else if (data.command === "copy") {
                        apps.copy(data.input[2], data.input[3], [], function biddle_init_start_copy() {
                            return true;
                        });
                    } else if (data.command === "get") {
                        apps.get(
                            data.input[2],
                            apps.getFileName(data.input[2]),
                            function biddle_init_start_getback(filedata) {
                                apps.writeFile(
                                    filedata,
                                    data.address.target + data.fileName,
                                    function biddle_init_start_getback_callback() {
                                        return filedata;
                                    }
                                );
                            }
                        );
                    } else if (data.command === "global") {
                        apps.global(data.abspath);
                    } else if (data.command === "hash") {
                        apps.hash(data.input[2], "hashFile", function biddle_init_start_hash() {
                            console.log(data.hashFile);
                        });
                    } else if (data.command === "install") {
                        apps.install(data.input[2], function biddle_init_start_installCallback() {
                            if (data.internal === true) {
                                return console.log(
                                    "Application " + text.cyan + data.packjson.name + text.nocolor +
                                    " is installed " + text.bold + text.yellow + "internally to biddle" + text.none +
                                    " at version: " + text.bold + text.green + data.packjson.version + text.none
                                );
                            }
                            console.log(
                                "Application " + text.cyan + data.packjson.name + text.nocolor + " is installed" +
                                " to version: " + text.bold + text.green + data.packjson.version + text.none
                            );
                        });
                    } else if (data.command === "list") {
                        apps.list();
                    } else if (data.command === "markdown") {
                        apps.markdown();
                    } else if (data.command === "publish") {
                        apps.publish();
                    } else if (data.command === "remove") {
                        apps.remove(data.input[2], function biddle_init_start_remove() {
                            return true;
                        });
                    } else if (data.command === "status") {
                        apps.status(data.input[2], false, function biddle_init_start_status(status) {
                            console.log(status);
                        });
                    } else if (data.command === "test") {
                        apps.test();
                    } else if (data.command === "uninstall") {
                        apps.uninstall(false);
                    } else if (data.command === "unpublish") {
                        apps.unpublish(false);
                    } else if (data.command === "unzip") {
                        apps.zip(function biddle_init_start_unzip(zipfilename) {
                            console.log("File " + zipfilename + " unzipped to: " + data.address.target);
                            return [zipfilename];
                        }, {
                            location: apps.relToAbs(data.input[2], data.cwd),
                            name    : ""
                        });
                    } else if (data.command === "update") {
                        apps.update(data.input[2], false, function biddle_init_start_update() {
                            console.log(text.yellow + data.input[2] + text.nocolor + " updated!");
                        });
                    } else if (data.command === "version") {
                        apps.version();
                    } else if (data.command === "zip") {
                        apps.zip(function biddle_init_start_zip(zipfilename) {
                            console.log("Zip file written: " + zipfilename);
                            return [zipfilename];
                        }, {
                            fileName: (function biddle_install_late() {
                                var sep  = (data.protocoltest.test(data.input[2]) === true)
                                        ? "/"
                                        : node.path.sep,
                                    dirs = data
                                        .input[2]
                                        .split(sep);
                                return dirs.pop();
                            }()),
                            location: apps.relToAbs(data.input[2], data.cwd),
                            name    : ""
                        });
                    }
                }
            };
        data.input   = (function biddle_input() {
            var a     = [],
                b     = 0,
                c     = process.argv.length,
                int   = -1,
                paths = [];
            if (process.argv[0] === "sudo") {
                process
                    .argv
                    .splice(0, 1);
                data.sudo = true;
            }
            paths = process
                .argv[0]
                .split(node.path.sep);
            if (paths[paths.length - 1] === "node" || paths[paths.length - 1] === "node.exe") {
                b = 1;
            }
            do {
                a.push(process.argv[b]);
                b = b + 1;
            } while (b < c);
            if (a.length < 1) {
                a = ["", "", ""];
            }
            a[0] = a[0].toLowerCase();
            if (a[a.length - 1] === "childtest") {
                a.pop();
                data.childtest = true;
            }
            int = a.indexOf("--internal");
            if (int > -1) {
                data.internal = true;
                a.splice(int, 1);
            }
            return a;
        }());
        data.command = (data.input.length > 1)
            ? (data.command[
                data
                    .input[1]
                    .toLowerCase()
                    .replace(/(s\s*)$/, "")
            ] === undefined && data.input[1].toLowerCase() !== "status")
                ? data
                    .input[1]
                    .toLowerCase()
                    .replace(/(s\s*)$/, "")
                    .replace(/^(-+)/, "")
                : data
                    .input[1]
                    .toLowerCase()
            : "";
        if (data.command === "v" || data.command === "ver") {
            data.command = "version";
        }
        if (data.command === "h") {
            data.command = "help";
        }
        data.abspath              = (function biddle_abspath() {
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
        data.platform             = process
            .platform
            .replace(/\s+/g, "")
            .toLowerCase();
        data.address.applications = data.abspath + "applications" + node.path.sep;
        data.address.downloads    = data.abspath + "downloads" + node.path.sep;
        data.address.publications = data.abspath + "publications" + node.path.sep;
        node
            .fs
            .readFile(
                data.abspath + "installed.json",
                "utf8",
                function biddle_init_installed(err, fileData) {
                    var parsed = {};
                    if (err !== null && err !== undefined) {
                        return apps.errout({error: err, name: "biddle_init_installed"});
                    }
                    if (fileData !== "") {
                        parsed = JSON.parse(fileData);
                    }
                    data.installed = parsed;
                    if (data.internal === true && (data.command === "list" || data.command === "install" || data.command === "status" || data.command === "update")) {
                        if (data.installed.internal === undefined) {
                            data.installed = {};
                        } else {
                            data.installed = data.installed.internal;
                        }
                    } else if (data.command !== "install" && data.command !== "update" && data.command !== "uninstall" && (data.command !== "test" || (data.command === "test" && data.input[2] !== undefined && data.input[2] !== "biddle"))) {
                        delete data.installed.internal;
                    }
                    status.installed = true;
                    if (status.published === true && status.biddlerc === true) {
                        start();
                    }
                }
            );
        node
            .fs
            .readFile(
                data.abspath + "published.json",
                "utf8",
                function biddle_init_published(err, fileData) {
                    var parsed = {};
                    if (err !== null && err !== undefined) {
                        return apps.errout({error: err, name: "biddle_init_published"});
                    }
                    if (fileData !== "") {
                        parsed = JSON.parse(fileData);
                    }
                    data.published   = parsed;
                    status.published = true;
                    if (status.installed === true && status.biddlerc === true) {
                        start();
                    }
                }
            );
        if (data.command === "get" || data.command === "install" || data.command === "publish") {
            if (data.input.length < 3) {
                return apps.errout({
                    error: "Biddle command " + text.yellow + text.bold + data.command + text.none + " requ" +
                            "ires an address or file path.",
                    name : "biddle_init"
                });
            }
            (function biddle_init_biddlerc() {
                var pubdir = apps.relToAbs(data.input[2].replace(/((\/|\\)+)$/, ""), data.cwd) +
                            node.path.sep,
                    rcpath = (data.command === "publish")
                        ? pubdir + ".biddlerc"
                        : process.cwd() + node.path.sep + ".biddlerc";
                node
                    .fs
                    .readFile(
                        rcpath,
                        "utf8",
                        function biddle_init_biddlerc_readFile(err, fileData) {
                            var parsed = {},
                                dirs   = function biddle_init_biddlerc_dirs(type) {
                                    if (typeof parsed.directories[type] === "string") {
                                        if (parsed.directories[type].length > 0) {
                                            if (data.command === "publish") {
                                                data.address[type] = apps.relToAbs(parsed.directories[type], pubdir) + node.path.sep;
                                            } else {
                                                data.address[type] = apps.relToAbs(parsed.directories[type], data.abspath) +
                                                        node.path.sep;
                                            }
                                            data
                                                .ignore
                                                .push(parsed.directories[type]);
                                            return;
                                        }
                                    }
                                };
                            if (err !== null && err !== undefined) {
                                if (err.toString().indexOf("no such file or directory") > 0) {
                                    status.biddlerc = true;
                                    if (status.installed === true && status.published === true) {
                                        start();
                                    }
                                    return;
                                }
                                return apps.errout({error: err, name: "biddle_init_biddlerc_readFile"});
                            }
                            parsed = JSON.parse(fileData);
                            dirs("applications");
                            dirs("downloads");
                            dirs("publications");
                            if (typeof parsed.exclusions === "object" && parsed.exclusions.length > 0) {
                                parsed
                                    .exclusions
                                    .forEach(function biddle_init_biddlerc_readFile_exclusions(value) {
                                        data
                                            .ignore
                                            .push(value.replace(/\\|\//g, node.path.sep));
                                    });
                                data
                                    .ignore
                                    .push(".biddlerc");
                            }
                            status.biddlerc = true;
                            if (status.installed === true && status.published === true) {
                                start();
                            }
                        }
                    );
            }());
        } else {
            status.biddlerc = true;
            if (status.installed === true && status.published === true) {
                start();
            }
        }
    }());
}());
