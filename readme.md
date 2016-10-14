# biddle
*A package management application without a package management service.*

## License
[MIT](https://opensource.org/licenses/MIT)

## Version
0.0.3

## About
This application is a cross-OS solution to creating zip files for distribution and fetching files via HTTP(S).  The project's goal is to provide a universal application distribution utility that is language agnostic, operating system independent, and platform independent.  The only additional requirement for distributing application packages is online storage on a web server.  This application provides all the utilities to retrieve, bundle, and unpackage applications.

biddle is inspired by the incredible awesomeness of [NPM](http://npmjs.com), but seeks to accomplish a few additional goals:

* *integrity* - Downloaded packages will perform a hash comparison before they are unpackaged.  If the hashes don't match the zip file will be saved in the downloads directory awaiting a human touch.
* *autonomy* - There is no central authority here.  Host your own publications and manage them as you please with any name you choose.
* *management* - There is no dependency hell here.  Dependency management will not be automated, but a means to manage and review the status of all installed/published packages is provided.
* *freedom* - biddle will work everywhere Node.js runs.  It can be used with any application written in any language whether binary or text.

## Project Status
**Unstable and in early developement.**

* command **get** is complete
* command **global** is complete
* command **hash** is complete
* command **help** is complete
* command **install** is complete
* command **markdown** is complete
* command **publish** is complete
* command **uninstall** is complete
* command **unpublish** is complete
* command **unzip** is complete
* command **zip** is complete


* command **test** will be the last thing to be marked as complete
* command **list** requires testing
* command **status** is not started
* need to work out *global* switch for **install** command
* OS specific commands need to be moved to the top of the file for clearer visibility
* there is a minor bug in the *lint* phase of the **test** command where the program occasionally exit early
* documentation is required for
   - package.json
   - directory structure and file requirements
   - installed.json and published.json structures


## Supported commands
Commands are the third command line argument, or second if the *node* argument is absent.  Commands are case insensitive, but values and local paths are case sensitive.  All local address are either absolute from the root or relative from the current working directory.

### get
Merely downloads the requested resource and saves it as a file with the same filename. If the filename is not provided in the URI the final directory up to the domain name will become the filename, and if for some reason that doesn't work the default filename is *download.xxx*.

Download a file to the default location, which is the provided *downloads* directory.

    node biddle get http://google.com

Download a file to an alternate location.

    node biddle get http://google.com ../mydirectory

### global
The global command adds biddle's path to the OS path variable so that biddle can be run from any location without explicitly calling Node.js, example: `biddle help` instead of `node biddle help`. Use the `remove` option to remove biddle from the path. This command requires use of sudo in non-Windows environments or an administrative console in Windows.

Allowing global availability to biddle in non-Windows environments.

    sudo node biddle global

Removing global availability to biddle in non-Windows environments.

    sudo biddle global remove

Allowing global availability to biddle in Windows. This command requires an administrative console.

    node biddle global

Removing global availability to biddle in non-Windows environments. This command requires an administrative console.

    biddle global remove

### hash
Prints to console a SHA512 hash against a local resource.

    node biddle hash downloads/myfile.zip

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

Output both lists

    node biddle list

### markdown
Allows the internal markdown parser used by the **help** command to be supplied to a directed file to ease reading of documentation directly from the command line.

The first argument after the command is the address of the file to read.

    node biddle markdown applications/example/readme.md

You can also specify a custom word wrap limit.  The default is still 100.

    node biddle markdown applications/example/readme.md 80

### publish
Writes a hash file and a zip file with a version number to the publications directory or some other specified location.  Applications are required to have a file in their root directory named *package.json* with properties: *name* and *version*.

Create a zip in the default location: ./publications/myapplication

    node biddle publish ../myapplication

Publish to a custom location: ./myAlternateDirectory/myapplication

    node biddle publish ../myapplication myAlternateDirectory

Use quotes if any argument contains spaces:

    node biddle publish "c:\program files\myApplication"

### status
(not written yet)
Will check whether an installed application is behind the latest published version.  Automation is planned but still under consideration.

### test
Run the user acceptance tests.

    node biddle test

### uninstall
Will delete an installed application by name and remove the application from the installed list.

    node biddle uninstall myApplicationName

### unpublish
Will delete a published application by name and remove the application from the published list.  An application name is required and not the address to the application.

    node biddle unpublish myApplicationName

### unzip
Unzips a local zipped file.

Unzip to the default location, the supplied *downloads* directory.

    node biddle unzip myZipFile.zip

Unzip to a specified location.

    node biddle unzip myZipFile.zip myDirectory

### zip
Zips local files or local directories into a zip file.

Zip to the default location, the supplied *downloads* directory.

    node biddle zip ../myApplication

Zip to a specified location.

    node biddle zip ../myApplication myCustom/Location/Directory

## Dependencies

* This application is written in JavaScript and requires [Node.js](https://nodejs.org/en/) to run.
* This application makes use of zip and hash utilities provided by the operating system.
* The *test* command requires [Pretty Diff](https://github.com/prettydiff/prettydiff.git) and [JSLint](https://github.com/douglascrockford/JSLint.git) as git submodules from Github.
