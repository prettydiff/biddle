# biddle

*A package management application without a package management service.*

## License

* [GPLv2](https://opensource.org/licenses/GPL-2.0)

## Version

0.0.2

## Project Status

**Unstable and in early developement.**

* The **get** command is fully operational, but demands examination for edge cases
* Working is starting on the **install** command, but it is not operational
* No work on packaging or versioning has started

## About

This application is a cross-OS solution to creating tarballs for distribution and fetching files via HTTP(S).  The project's goal is to provide a universal application distribution utility that is language agnostic, operating system independent, and platform independent.  The only additional requirement for distributing application packages is online storage on a web server.  This application provides all the client utilities to retrieve and unpackage applications.

## API

The application runs from the command line and takes four arguments:

* **runtime environment** Typically this would be Node.js, but it could be something additional in the future.  If globally installed and added to the shell's path then this first argument is unnecessary.
* **biddle.js** This required argument runs the *biddle* application.  The *.js* file extension might be optional depending upon the run time environment.
* **command** biddle can run various different commands.  This argument is required and the list of supported commands is indicated below.
* **address of the package** A URI is required.  This should be a URI to a compressed tar, but biddle will fetch any resource.
* **local directory to save or install to** This final argument is entirely optional.  If absent the fetched resource will be written to the shell's current working directory.  This value is relative from the current working directory.

### Command line examples

* `node biddle.js install URI_of_package directory_to_save_or_install`
* `biddle install http://example.com/downloads/app-min@latest.tar.bz2`
* `node biddle/biddle.js get http://example.com/application.js ../downloads/example.com`

## Supported commands

Commands are the third command line argument, second if the optional *node* argument is absent.  Commands are case insensitive.

* **get** Merely downloads the requested resource and saves it as a file with the same filename. If the filename is not provided in the URI the final directory up to the domain name will become the filename, and if for some reason that doesn't work the default filename is *download.xxx*.
* **install** Downloads the requested resource, but decompresses and unpackages the tarball before writing files to disk.

## Dependencies

* This application is written in JavaScript and requires [Node.js](https://nodejs.org/en/).
* [TarTools 2.0 Beta](http://tartool.codeplex.com/releases/view/85391) is included to provide Unix Tar and compression capabilities natively to Windows.  [Source code](http://tartool.codeplex.com/SourceControl/latest).
