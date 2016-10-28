# biddle, Documentation

## Commands

### Command Definitions and Examples
For definitions and usage examples please see the [readme.md](../readme.md) file.

### Command Overview
biddle operates with the convention: `biddle command argument1 argument2`

The following table describes which commands require arguments and which commands run locally without a network connection.  Commands with a "?" in the *Local* column are commands that will access the internet if provided a web address as an argument.  A second argument is required for the **copy** command and either optional or unused for all other commands.

Command|Local|Argument Type|Second Argument
---|---|---|---
commands|✓|none|none
copy|✓|file path or directory path|directory path
get|?|file path|none
global|✓|none|none
hash|✓|file path|none
help|✓|number|none
install|?|zip file|directory path
list|✓|"*installed*" or "*published*"|none
markdown|✓|path to markdown file|number
publish|✓|directory path|directory path
remove|✓|file path or directory path|none
status|?|none or application name|none
test|?|application name|none
uninstall|✓|application name|none
unpublish|✓|application name|none
unzip|✓|path to zip file|directory path
zip|✓|file path or directory path|directory path

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

The data is similar to the data stored in published.json, but more simple.  This data only associates a single version to an application and provides an address to retrieved zip file's directory in the *published* property.  The published property is always an absolute path whether a web address or path on the local file system.

### Naming Conflicts
Naming conflicts may occur in exactly the same way as described for publications for the same reasons.

## Managing Applications
biddle provides two commands to help manage applications: **list** and **status**.

### list Command
The **list** command will indicate locally available applications by either publication, installation, or both.  These lists include the application name, its latest published version or currently installed version, and the directory where the application is installed or published to.  Although biddle can unpublish or uninstall applications from any location on the local file system printing the applications address is informative from a system management perspective.

### status Command
The **status** command determines if installed applications are outdated compared to the published version.  This command reaches out to the publication point indicated by the *published* property in the installed.json file, which could result in a network call if the publication point is a point on the web.

### test Command
The **test** command spawns a child process to run an application's user acceptance tests from the command line. Although the command is run in a child process the output is returned to the current terminal as its generated.  This is handy to verify the health and acceptance of an application before installing it or executing it.

## File Conventions
The **publish** command writes files in addition to the necessary zip archive files.  For every zip file written by the publish command a hash file of the same file name is also written.  These file names, excluding the zip and hash file extensions, must remain the same or the **install** command will not unzip the zip file.

If the *publication_variants* property is properly populated in an application's package.json file additional zip and hash files will also be written.  Please see the [package.md](package.md) file for comprehensive information of *publication_variants*.

If a the application qualifies as a latest publication copies of the zip and hash files from this published version will be written, or overwritten if already present, containing the word *latest* in the filename in place of the version.  A text file will also be written, or overwritten if already present, named *latest.txt* containing only the version string.  The latest.txt file is required for successful operation of the **status** command.  For examples and more details please see [gettingstarted.md](gettingstarted.md).

An application qualifies for latest status under the following conditions:

* The application is published for the first time.
* The version string is greater than the prior version string, based upon JavaScript string comparison logic, and does not contain the words *alpha* or *beta*.
