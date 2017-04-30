# biddle
*A package management application without a package management service.*

## License
[MIT](https://opensource.org/licenses/MIT)

## Version
1.1.0 [![Build Status Image](https://semaphoreci.com/api/v1/prettydiff/biddle/branches/master/badge.svg)](https://semaphoreci.com/prettydiff/biddle) [![AppVeyor Build](https://ci.appveyor.com/api/projects/status/github/prettydiff/biddle?branch=master&svg=true)](https://ci.appveyor.com/project/prettydiff/biddle)
[![NSP Status](https://nodesecurity.io/orgs/prettydiff/projects/dd20fc59-e9b4-4ff0-818e-e322a68811bf/badge)](https://nodesecurity.io/orgs/prettydiff/projects/dd20fc59-e9b4-4ff0-818e-e322a68811bf)

## About
This application is a cross-OS solution to creating zip files for distribution and fetching files via HTTP(S).  The project's goal is to provide a universal application distribution utility that is language agnostic, operating system independent, and platform independent.  The only additional requirement for distributing application packages is online storage on a web server.  This application provides all the utilities to retrieve, bundle, and unpackage applications.

biddle is inspired by the incredible awesomeness of [NPM](http://npmjs.com), but seeks to accomplish a few additional goals:

* *integrity* - Downloaded packages will perform a hash comparison before they are unpackaged.  If the hashes don't match the zip file will be saved in the downloads directory awaiting a human touch.
* *autonomy* - Be freed from censorship.  There is no central authority here.  Host your own publications and manage them as you please from any location and with any name or content you choose.
* *privacy* - Put biddle behind your firewall or an isolated environment to prevent public access to your applications and data.
* *management* - There is no dependency hell here.  Dependency management will not be automated, but a means to manage and review the status of all installed/published packages is provided.
* *freedom* - biddle will work everywhere Node.js runs.  It can be used with any application written in any language whether binary or text.

## Documentation
* [Getting Started](documentation/gettingstarted.md)
* [package.json](documentation/package.md)
* [Documentation](documentation/documentation.md)

## Supported commands
Commands are the third command line argument, or second if the *node* argument is absent.  Commands are case insensitive, but values and local paths are case sensitive.  All local address are either absolute from the root or relative from the current working directory.

### commands
Conveniently lists the supported commands with a brief description.

    node biddle commands

### copy
Copy files or directories to a different directory.

    node biddle copy myFile myOtherDirectory
    node biddle copy myDirectory myOtherDirectory

### get
Merely downloads the requested resource and saves it as a file with the same filename. If the filename is not provided in the URI the final directory up to the domain name will become the filename, and if for some reason that doesn't work the default filename is *download.xxx*.

Download a file to the default location, which is the provided *downloads* directory.

    node biddle get http://google.com

Download a file to an alternate location.

    node biddle get http://google.com ../mydirectory

### global
The global command adds an applications's path to the OS path variable so that the application can be run from any location as a command, for example: `biddle help` from root instead of `node biddle help` from the local biddle directory. Use the `remove` option to remove biddle from the path. This command requires use of an administrative console in Windows.  For additional requirements see section **Global Application Requirements** in the [documentation](documentation/documentation.md).

Allowing global availability to biddle.

    node biddle global

Allowing global availability to any other application installed by biddle.

    biddle global myApplication

Removing global availability to biddle.

    biddle global remove

Removing global availability to any other application installed by biddle.

    biddle global myApplication remove

### hash
Prints to console a SHA512 hash against a local file.

    node biddle hash downloads/myfile.zip

Hash a string by indicating *string* and a value instead of a file path.

    node biddle hash string "my string value"

### help
Prints the readme.md file contents to console in a human friendly way.

No command will still generate the readme data.

    node biddle

The default word wrapping is set to 100 characters.

    node biddle help

Set a custom word wrap limit.

    node biddle help 80

### install
Downloads the requested zip file, but performs a hash comparison before unzipping the file.

    node biddle install http://example.com/downloads/application_latest.zip

### list
Will list all installed and/or published applications with their locations and latest versions.  It can take the optional argument *installed* or *published* to output a specific list or both lists are produced.

Only output the installed list.

    node biddle list installed

Only output the published list.

    node biddle list published

Output both lists

    node biddle list

### markdown
Allows the internal markdown parser used by the **help** command to be supplied to a directed file to ease reading of documentation directly from the command line.

The first argument after the command is the address of the file to read.

    node biddle markdown applications/example/readme.md

You can also specify a custom word wrap limit.  The default is 100.

    node biddle markdown applications/example/readme.md 80

### publish
Writes a hash file and a zip file with a version number to the publications directory or some other specified location.  Applications are required to have a file in their root directory named *package.json* with properties: *name* and *version*.

Create a zip in the default location: ./publications/myApplicationDirectory

    node biddle publish ../myApplicationDirectory

Publish to a custom location: ./myAlternateDirectory/myApplicationDirectory

    node biddle publish ../myApplicationDirectory myAlternateDirectory

Use quotes if any argument contains spaces:

    node biddle publish "c:\program files\myApplicationDirectory"

### remove
Removes a file or a directory tree

    node biddle remove myDirectory
    node biddle remove myFile

### status
Will check whether an installed application is behind the latest published version.

Check the status of all installed applications

    node biddle status

Check the status of an application by name

    noe biddle status myApplicationName

### test
Run the user acceptance tests for a given application. This command requires a *test* property in a package.json file.

Run the tests against biddle

    node biddle test

Run the tests against an installed application

    node biddle test applicationName

Run the tests against a directory in the current location

    node biddle test ./directory

Run the tests against a directory in a different location

    node biddle test ../../directory

### uninstall
Will delete an installed application by name and remove the application from the installed list.

    node biddle uninstall myApplicationName

### unpublish
Will delete a published application by name and version then remove the respective files.

Unpublish an application by version.

    node biddle unpublish myApplicationName 1.0.0

Unpublish an application's latest version

    node biddle unpublish myApplicationName latest

Remove the published application entirely.

    node biddle unpublish myApplicationName all

### unzip
Unzips a local zipped file.

Unzip to the default location, the supplied *downloads* directory.

    node biddle unzip myZipFile.zip

Unzip to a specified location.

    node biddle unzip myZipFile.zip myDirectory

### version
Prints the version number/name of biddle or a named installed application.

    If no application is specified the current version of biddle is output.

    node biddle version

    Output the current version of "myApplication".

    node biddle version myApplication

### zip
Zips local files or local directories into a zip file.

Zip to the default location, the supplied *downloads* directory.

    node biddle zip ../myApplication

Zip to a specified location.

    node biddle zip ../myApplication myCustom/Location/Directory

## Dependencies

* This application is written in JavaScript and requires [Node.js](https://nodejs.org/en/) to run.
* This application makes use of zip utilities provided by operating systems.
* This application requires use of Windows's PowerShell to execute the *global* coammand in Windows.
* The *test* command requires [Pretty Diff](https://github.com/prettydiff/prettydiff.git) and [JSLint](https://github.com/douglascrockford/JSLint.git) as git submodules from Github.
