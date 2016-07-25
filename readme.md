# biddle
*A package management application without a package management service.*

## License
[MIT](https://opensource.org/licenses/MIT)

## Version
0.0.3

## About
This application is a cross-OS solution to creating tarballs for distribution and fetching files via HTTP(S).  The project's goal is to provide a universal application distribution utility that is language agnostic, operating system independent, and platform independent.  The only additional requirement for distributing application packages is online storage on a web server.  This application provides all the utilities to retrieve, bundle, and unpackage applications.

biddle is inspired by the incredible awesomeness of [NPM](http://npmjs.com), but seeks to accomplish a few additional goals:

* *integrity* - Downloaded packages will perform a hash comparison before they are unpackaged.  If the hashes don't match the tarball will be saved in the downloads directory awaiting a human touch.
* *autonomy* - There is no central authority here.  Host your own publications and manage them as you please with any name you choose.
* *management* - There is no dependency hell here.  Dependency management will not be automated, but a means to manage and review the status of all installed/published packages is provided.
* *freedom* - biddle will work everywhere Node.js runs.  It can be used with any application written in any language whether binary or text.

## Project Status
**Unstable and in early developement.**

* command **get** is complete
* command **hash** is complete
* command **help** is complete
* command **markdown** is complete
* Work on **install** is blocked pending completion of **publish**
* Work on **publish** is underway.
  - Tarball can be produced and written cross-OS.
  - hash file is being written
  - published.json is being updated
  - Command appears minimally complete, but demands more testing
  - A version *latest* must still be written
* No work on advanced configurations has started.  This will likely wait until after an initial launch of very basic features
  - Allow restriction of named directories when creating a tarball so that production only packages don't have dev dependencies, build systems, unit tests, and so forth
  - Allow packages to specify where they will install to
  - Allow a .biddlerc file for setting custom defaults
* Work on **status** is not started.  This command will compare an installed application's version against a published version to determine if out of date.
  - Must allow an app name as an argument to manually check that application or *all* to check all installed applications
  - Status automation or intervals would be nice... such as checking app versions once a week and providing a message when out of date
* Work on **list** command is blocked pending completion of **publish**.  This command will list installed/published applications by name and version and will know of their publication location and installation directory.
* Work on **uninstall** command is blocked pending completion of **install**.
  - Must delete the application
  - Must remove the application from the **list**
* Work on **unpublish** command is blocked pending completion of **publish**.
  - Must delete the application
  - Must remove the application from the **list**
* (not started) Allow quoted values from command line arguments in the case where an address contains spaces

## Supported commands
Commands are the third command line argument, or second if the optional *node* argument is absent.  Commands are case insensitive, but values and local paths are case sensitive.  All local address are either absolute from the root or relative from the current working directory.

### get
Merely downloads the requested resource and saves it as a file with the same filename. If the filename is not provided in the URI the final directory up to the domain name will become the filename, and if for some reason that doesn't work the default filename is *download.xxx*.

Download a file to the default location, which is the provided *downloads* directory.
    node biddle.js get http://google.com

Download a file to an alternate location.
    node biddle.js get http://google.com ../mydirectory

### hash
Prints to console a SHA512 hash against a local resource.
    node biddle.js hash downloads/myfile.tar.bz2

### help
Prints the readme.md file contents to console in a human friendly way.

No command will still generate the readme data.

    node biddle.js

The default word wrapping is set to 100 characters.

    node biddle.js help

Set a custom word wrap limit.

    node biddle.js help 80

### install
(not written yet)
Downloads the requested resource, but decompresses and unpackages the tarball before writing files to disk.

### list
(not writte yet)
Will list all installed or all published applications and their locations.

### markdown
Allows the internal markdown parser used by the **help** command to be supplied to a directed file to ease reading of documentation directly from the command line.

The first argument after the command is the address of the file to read.

    node biddle.js markdown applications/example/readme.md

You can also specify a custom word wrap limit.  The default is still 100.

    node biddle.js markdown applications/example/readme.md 80

### publish
Writes a hash file and a tar.bz2 file with a version number to the publications directory or some other specified location.  Applications are required to have a file in their root directory named *package.json* with properties: *name* and *version*.

Create a tarball in the default location: ./publications/myapplication

    node biddle.js publish ../myapplication

Publish to a custom location: ./myAlternateDirectory/myapplication

    node biddle.js publish ../myapplication myAlternateDirectory

### status
(not written yet)
Will check whether an installed application is behind the latest published version.  Automation is planned but still under consideration.

### uninstall
(not written yet)
Will delete an installed application by name and remove the application from the installed list.

### unpublish
(not written yet)
Will delete a published application by name and remove the application from the published list.

## Dependencies

* This application is written in JavaScript and requires [Node.js](https://nodejs.org/en/).
