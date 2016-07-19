# biddle
*A package management application without a package management service.*

## License

* [GPLv2](https://opensource.org/licenses/GPL-2.0)

## Version
0.0.2

## Project Status
**Unstable and in early developement.**

* command **get** is complete
* command **hash** is complete
* Work on **install** is blocked pending completion of **publish**
* Work on **publish** is underway.
  - First level of support will be just producing a tarball on various OSs and opening across OSs
* No work on advanced configurations has started.  This will likely wait until after an initial launch of very basic features
  - Publish packages by version number
  - Create a symlink for version *latest* that points to the latest versioned tarball
  - Allow restriction of named directories when creating a tarball so that production only packages don't have dev dependencies, build systems, unit tests, and so forth
  - Allow packages to specify where they will install to

## About
This application is a cross-OS solution to creating tarballs for distribution and fetching files via HTTP(S).  The project's goal is to provide a universal application distribution utility that is language agnostic, operating system independent, and platform independent.  The only additional requirement for distributing application packages is online storage on a web server.  This application provides all the client utilities to retrieve and unpackage applications.

## Supported commands
Commands are the third command line argument, or second if the optional *node* argument is absent.  Commands are case insensitive, but values and local paths are case sensitive.  All local address are either absolute from the root or relative from biddle.

### get
Merely downloads the requested resource and saves it as a file with the same filename. If the filename is not provided in the URI the final directory up to the domain name will become the filename, and if for some reason that doesn't work the default filename is *download.xxx*.

Download a file to the default location, which is the provided *downloads* directory.
`node biddle.js get http://google.com`

Download a file to an alternate location.
`node biddle.js get http://google.com ../mydirectory`

### hash
Prints to console a SHA512 hash against a local resource.
`node biddle.js hash downloads/myfile.tar.bz2`

### help
Prints the readme.md file contents to console in a human friendly way.

No command will still generate the readme data.
`node biddle.js`

The default word wrapping is set to 100 characters.
`node biddle.js help`

Set a custom word wrap limit.
`node biddle.js help 80`

### install
(not written yet)
Downloads the requested resource, but decompresses and unpackages the tarball before writing files to disk.

### publish
(not written yet)
Writes a tar.bz2 file with version number to the publications directory.

## Dependencies

* This application is written in JavaScript and requires [Node.js](https://nodejs.org/en/).
* [TarTools 2.0 Beta](http://tartool.codeplex.com/releases/view/85391) is included to provide Unix Tar and compression capabilities natively to Windows.  [Source code](http://tartool.codeplex.com/SourceControl/latest).
