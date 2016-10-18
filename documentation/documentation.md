# biddle, Documentation

## Commands

### Command Definitions and Examples
For definitions and usage examples please see the [readme.md](../readme.md) file.

### Command Overview
biddle operates with the convention: `biddle command argument1 argument2`

The following table describes which commands require arguments and which commands run locally without a network connection.  A second argument is required for the **copy** command and either optional or unused for all other commands.

Command|Local Only|Argument Type|Second Argument
---|---|---|---
copy|yes|file path or directory path|directory path
get|optional|file path|none
global|yes|none|none
hash|yes|file path|none
help|yes|number|none
install|optional|zip file|directory path
list|yes|"*installed*" or "*published*"|none
markdown|yes|path to markdown file|number
publish|yes|directory path|directory path
remove|yes|file path or directory path|none
status|yes|none or application name|none
test|no|none|none
uninstall|yes|application name|none
unpublish|yes|application name|none
unzip|yes|path to zip file|directory path
zip|yes|file path or directory path|directory path

### cmds Object
Some biddle commands require OS specific actions.  For instance the commands to recursively delete a directory tree, copy a directory tree, or zip a file differ by operating system.  Many of these simple operations are required for the primary publication and installation tasks and are provided directly as a convenience.

These commands are found in the **cmds** object in biddle.js near the top of the file.

## Publication and the published.json File
The published.json file stores data on applications published by biddle with the following schema:

    {
        "applicationName": {
            "directory": "path/to/application",
            "latest"   : "latestVersion",
            "versions" : [
                "version", "olderVersion"
            ]
        }
    }

### Naming Conflicts
If an application is published with the same name an version as a previously published application biddle with throw an error.  If an application is published with the same name as an existing application it will be installed to the same location as the existing application.  If a new location is desired first unpublish the application and then publish it to the desired location.

Since applications are stored by name an application of a given name may only exist once in biddle.  Should a name conflict arise a possible solution is to run multiple instances of biddle for different types of applications.  With biddle there isn't any central repository so another solution is to simply rename an application to something unique prior to publication.

### Directory
The default publication point is the *publications* directory in biddle.  An application may be published to any location permitted by the operating system.  This location is stored as the *directory* property in the published.json file.

### Versions
Versions in biddle are completely free form.  [SemVer](http://semver.org/) is strongly encourage, but any string is accepted.

### Latest Version
In addition to publishing a specified version of an application biddle will also create a *latest* version in the following criteria is met:

 * The current version is the first publication
 * larger than the immediately preceding version where larger means sorts higher after a JavaScript string sort.

## Installation and the installed.json File
The published.json file stores data on applications published by biddle with the following schema:

    {
        "applicationName": {
            "location" : "path/to/application",
            "published": "address/of/publication",
            "version"  : "currentVersion"
        }
    }

### Naming Conflicts
Naming conflicts may occur in exactly the same way as described for publications for the same reasons.
