/*jshint laxbreak: true*/
/*jslint node: true, for: true*/
(function biddle() {
    "use strict";
    var child     = require("child_process").exec,
        path      = require("path"),
        fs        = require("fs"),
        http      = require("http"),
        https     = require("https"),
        dir       = "",
        hash      = "",
        version   = "",
        platform  = process.platform.replace(/\s+/g, "").toLowerCase(),
        errout    = function biddle_errout(message) {
            console.log(message);
            process.exit(1);
        },
        help      = function biddle_help() {
            fs.readFile("readme.md", "utf8", function biddle_input_readme(err, readme) {
                var lines = [],
                    list  = [],
                    ind   = "",
                    elist = function () {
                        var listlen = list.length;
                        if (listlen > 0) {
                            do {
                                listlen -= 1;
                                ind = ind.slice(2);
                                list.pop();
                            } while (listlen > 0);
                        }
                    },
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
                        var chars = lines[b].replace(/`/g, "bix~").split(""),
                            final = chars.length,
                            s     = (/\s/),
                            x     = 0,
                            y     = ind.length,
                            extra = 0,
                            index = 0,
                            endln = (isNaN(input[1]) === false)
                                ? Number(input[1]) - y
                                : 100 - y,
                            quote = "",
                            wrap  = function biddle_help_readme_parse_wrap() {
                                var z = x;
                                if (extra === 0) {
                                    extra = (listitem === true)
                                        ? y + 4
                                        : y + 2;
                                }
                                if (s.test(chars[x]) === true) {
                                    if (listitem === true) {
                                        chars[x] = "\n  " + ind;
                                        index    = 3 + y + x;
                                    } else {
                                        chars[x] = "\n" + ind;
                                        index    = 1 + y + x;
                                    }
                                    if (chars[x - 1] === " ") {
                                        chars[x - 1] = "";
                                    } else if (chars[x + 1] === " ") {
                                        chars.splice(x + 1, 1);
                                        final -= 1;
                                    }
                                } else {
                                    do {
                                        z -= 1;
                                    } while (s.test(chars[z]) === false && z > index);
                                    if (z > index) {
                                        if (listitem === true) {
                                            chars[z] = "\n  " + ind;
                                            index    = 3 + y + z;
                                        } else {
                                            chars[z] = "\n" + ind;
                                            index    = 1 + y + z;
                                        }
                                        if (chars[z - 1] === " ") {
                                            chars[z - 1] = "";
                                        } else if (chars[z + 1] === " ") {
                                            chars.splice(z + 1, 1);
                                            final -= 1;
                                        }
                                    }
                                }
                            };
                        chars.splice(0, 0, ind);
                        for (x = y; x < final; x += 1) {
                            if (quote === "") {
                                if (chars[x - 1] === "*" && chars[x] === "*") {
                                    quote = "**";
                                    chars.splice(x - 1, 2);
                                    chars[x - 1] = bld + chars[x - 1];
                                    final -= 2;
                                } else if (chars[x - 1] === "*" && ((x === 1 && chars[x] !== " ") || x !== 1)) {
                                    quote = "*";
                                    chars.splice(x - 1, 1);
                                    chars[x - 1] = itl + tan + chars[x - 1];
                                    final -= 1;
                                } else if (chars[x - 4] === "b" && chars[x - 3] === "i" && chars[x - 2] === "x" && chars[x - 1] === "~") {
                                    quote = "`";
                                    chars.splice(x - 4, 4);
                                    x -= 3;
                                    chars[x - 1] = grn + chars[x - 1];
                                    final -= 4;
                                } else if (chars[x - 2] === "]" && chars[x - 1] === "(") {
                                    quote = ")";
                                    chars[x - 1] = chars[x - 1] + cyn;
                                }
                            } else if (chars[x - 3] === "b" && chars[x - 2] === "i" && chars[x - 1] === "x" && chars[x] === "~" && quote === "`") {
                                quote = "";
                                chars.splice(x - 3, 4);
                                x -= 3;
                                chars[x - 1] = chars[x - 1] + enc;
                                final -= 4;
                                if ((x - (index - extra)) / endln > 1 && chars[x + 1] === " ") {
                                    x += 1;
                                    wrap();
                                }
                            } else if (chars[x] === ")" && quote === ")") {
                                quote = "";
                                chars[x - 1] = chars[x - 1] + enc;
                                if ((x - (index - extra)) / endln > 1 && chars[x + 1] === " ") {
                                    x += 1;
                                    wrap();
                                }
                            } else if (chars[x] === "*" && chars[x + 1] === "*" && quote === "**") {
                                quote = "";
                                chars.splice(x, 2);
                                chars[x - 1] = chars[x - 1] + ens;
                                final -= 2;
                            } else if (chars[x] === "*" && quote === "*") {
                                quote = "";
                                chars.splice(x, 1);
                                chars[x - 1] = chars[x - 1] + enc + ens;
                                final -= 1;
                            }
                            if ((x - (index - extra)) / endln > 1 && quote !== "`") {
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
                    };
                if (err !== null && err !== undefined) {
                    return errout(err);
                }
                readme = readme.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
                lines  = readme.split("\n");
                len    = lines.length;
                console.log("");
                for (b = 0; b < len; b += 1) {
                    if (lines[b].indexOf("#### ") === 0) {
                        elist();
                        ind = "      ";
                        lines[b] = ind + und + bld + tan + lines[b].slice(5) + enc + ens + enu;
                    } else if (lines[b].indexOf("### ") === 0) {
                        elist();
                        ind = "    ";
                        lines[b] = ind + und + bld + grn + lines[b].slice(4) + enc + ens + enu;
                    } else if (lines[b].indexOf("## ") === 0) {
                        elist();
                        ind = "  ";
                        lines[b] = ind + und + bld + cyn + lines[b].slice(3) + enc + ens + enu;
                    } else if (lines[b].indexOf("# ") === 0) {
                        elist();
                        ind = "";
                        lines[b] = und + bld + red + lines[b].slice(2) + enc + ens + enu;
                    } else if ((/^(\s*\*\s)/).test(lines[b]) === true) {
                        if (list[list.length - 1] !== "*") {
                            list.push("*");
                            ind = ind + "  ";
                        }
                        parse(true);
                        lines[b] = lines[b].replace("*", bld + red + "*" + enc + ens);
                    } else if ((/^(\s*-\s)/).test(lines[b]) === true) {
                        if (list[list.length - 1] !== "-") {
                            list.push("-");
                            ind = ind + "  ";
                        }
                        parse(true);
                        lines[b] = lines[b].replace("-", bld + red + "-" + enc + ens);
                    } else {
                        elist();
                        if (lines[b].length > 0) {
                            parse(false);
                        }
                    }
                    console.log(lines[b]);
                }
                process.exit(0);
            });
        },
        input     = (function biddle_input() {
            var a = process.argv;
            a.splice(0, 1);
            if (a[0].indexOf("biddle") > 0) {
                a.splice(0, 1);
            }
            if (a.length < 1) {
                help();
                a = ["", "", ""];
            }
            a[0] = a[0].toLowerCase();
            return a;
        }()),
        command   = input[0].toLowerCase(),
        fileName  = (function biddle_writeFile_fileName() {
            var paths = [];
            if (input[1] === undefined) {
                return errout("Error: unrecognized command '" + command + "'");
            }
            paths = input[1].split("/");
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
        }()),
        directory = (function biddle_directory() {
            if (typeof input[2] !== "string" || input[2].length < 1 || (/^(\s)$/).test(input[2]) === true) {
                return "";
            }
            if (input[2] !== "\\" && input[2] !== "/") {
                input[2] = input[2].replace(/(\/|\\)$/, "");
            }
            dir = process.cwd();
            fs.stat(input[2], function biddle_directory_stat(err, stats) {
                var dirs   = [],
                    ind    = 0,
                    len    = 0,
                    restat = function biggle_directory_stat_restat() {
                        fs
                            .stat(dirs.slice(0, ind + 1).join(path.sep), function biddle_directory_stat_restat_callback(erra, stata) {
                                ind += 1;
                                if ((erra !== null && erra.toString().indexOf("no such file or directory") > 0) || (typeof erra === "object" && erra !== null && erra.code === "ENOENT")) {
                                    return fs.mkdir(dirs.slice(0, ind).join(path.sep), function biddle_directory_stat_restat_callback_mkdir(errb) {
                                        if (errb !== null && errb.toString().indexOf("file already exists") < 0) {
                                            return errout(errb);
                                        }
                                        if (ind < len) {
                                            biggle_directory_stat_restat();
                                        } else {
                                            process.chdir(input[2]);
                                        }
                                    });
                                }
                                if (erra !== null && erra.toString().indexOf("file already exists") < 0) {
                                    return errout(erra);
                                }
                                if (stata.isFile() === true) {
                                    return errout("Destination directory, '" + input[2] + "', is a file.");
                                }
                                if (ind < len) {
                                    biggle_directory_stat_restat();
                                } else {
                                    process.chdir(input[2]);
                                }
                            });
                    };
                if ((err !== null && err.toString().indexOf("no such file or directory") > 0) || (typeof err === "object" && err !== null && err.code === "ENOENT")) {
                    dirs = input[2]
                        .replace(/\\/g, "/")
                        .split("/");
                    len  = dirs.length;
                    return restat();
                }
                if (err !== null && err.toString().indexOf("file already exists") < 0) {
                    return errout(err);
                }
                if (stats.isFile() === true) {
                    return errout("Destination directory, '" + input[2] + "', is a file.");
                }
            });
            return input[2];
        }()),
        hashCmd   = function biddle_hashCmd(filepath, callback) {
            var cmd = "";
            if (platform === "darwin") {
                cmd = "shasum -a 512 " + filepath;
            } else if (platform === "win32" || platform === "win64") {
                cmd = "certUtil -hashfile " + filepath + " SHA512";
            } else {
                cmd = "sha512sum " + filepath;
            }
            child(cmd, function biddle_hashCmd_exec(err, stdout, stderr) {
                if (err !== null) {
                    return errout(err);
                }
                if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                    return errout(stderr);
                }
                stdout = stdout.replace(/\s+/g, "");
                stdout = stdout.replace(filepath, "");
                stdout = stdout.replace("SHA512hashoffile:", "");
                stdout = stdout.replace("CertUtil:-hashfilecommandcompletedsuccessfully.", "");
                hash   = stdout;
                callback();
            });
        },
        tar       = function biddle_tar(compress) {
            //cjf - create bz2
            //czf - create gzip
            //xjf - unpack bz2
            //xzf - unpack gzip
            //
            //windows - "tartool2_beta/tartool.exe cjf tar_name " + filepath
            //linux   - "tar cjf tar_name " + filepath
            var app = (platform === "win32" || platform === "win64")
                    ? "tartool2_beta/tartool.exe "
                    : "tar ",
                pak = (compress === true)
                    ? "c"
                    : "x",
                opt = (compress === false && fileName.indexOf("tar.gz") > 0)
                    ? "z"
                    : "j",
                bz2 = (compress === true)
                    ? "publications" + path.sep + fileName + ".tar.bz2"
                    : "",
                spc = (compress === true)
                    ? " "
                    : "",
                cmd = app + pak + opt + "f " + bz2 + spc + input[1];
            child(cmd, function biddle_tar_child(err, stdout, stderr) {
                var callback = function biddle_tar_child_callback() {
                    if (compress === true) {
                        fs.stat(bz2, function biddle_tar_child_callback_stat(errstat, stat) {
                            if (errstat !== null) {
                                return errout(errstat);
                            }
                            //hash is updated
                            //write hash to file
                            //both hash and tar filenames must be versioned
                            console.log("File " + bz2 + " written at " + commas(stat.size) + " bytes.");
                        });
                    }
                };
                if (err !== null) {
                    return errout(err);
                }
                if (stderr !== null && stderr.replace(/\s+/, "") !== "") {
                    return errout(stderr);
                }
                hashCmd(bz2, callback);
                return stdout;
            });
        },
        commas    = function biddle_commas(number) {
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
        writeFile = function biddle_writeFile(fileData) {
            fs
                .writeFile("downloads" + path.sep + fileName, fileData, function biddle_writeFile_callback(err) {
                    if (err !== null) {
                        return errout(err);
                    }
                    if (command === "get") {
                        fs.stat("downloads" + path.sep + fileName, function biddle_writeFile_callback_getstat(errstat, stat) {
                            if (errstat !== null) {
                                return errout(errstat);
                            }
                            console.log("File downloads" + path.sep + fileName + " written at " + commas(stat.size) + " bytes.");
                        });
                    }
                    if (dir !== "") {
                        process.chdir(dir);
                    }
                });
        },
        install   = function biddle_install(fileData) {
            //child("tar ");
        },
        get       = function biddle_get(install) {
            var a        = (typeof input[1] === "string")
                    ? input[1].indexOf("s://")
                    : 0,
                file     = "",
                callback = function biddle_get_callback(res) {
                    res.setEncoding("utf8");
                    res.on("data", function biddle_get_callback_data(chunk) {
                        file += chunk;
                    });
                    res.on("end", function biddle_get_callback_end() {
                        if (install === true) {
                            install(file);
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
    } else if (command === "publish") {
        tar(true);
    } else if (command === "hash") {
        hashCmd(input[1], function () {
            console.log(hash);
        });
    } else if (command === "help" || command === "" || command === "?") {
        help();
    } else {
        console.log("Error: unrecognized command '" + command + "'");
    }
}());
