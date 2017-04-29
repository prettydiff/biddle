# biddle, Documentation

## Commands

### Command Definitions and Examples
For definitions and usage examples please see the [readme.md](../readme.md) file.

### Command Overview
biddle operates with the convention: `biddle command argument1 argument2`

The following table describes which commands require arguments and which commands run locally without a network connection.  Commands with a "?" in the *Local* column are commands that will access the internet if provided a web address as an argument while commands with a "✓" will not access the internet.  A second argument is required for the **copy** command and either optional or unused for all other commands.

Command|Local|Argument Type|Second Argument
---|---|---|---
commands|✓|none|none
copy|✓|local file system address|directory path
get|?|local or web address|directory path
global|✓|application name|none or "*remove*"
hash|✓|file path or "*string*"|string value
help|✓|number|none
install|?|zip file address (local or web)|directory path
list|✓|"*installed*" or "*published*"|none
markdown|✓|path to markdown file|number
publish|✓|directory path|directory path
remove|✓|local file system address|none
status|?|none or application name|none
test|?|application name|none
uninstall|✓|application name|none
unpublish|✓|application name|"*all*" or "*latest*" or version
unzip|✓|path to zip file|directory path
update|✓|application name|none
version|✓|none or installed app name|none
zip|✓|local file system address|directory path

### cmds Object
Some biddle commands require OS specific actions.  For instance the commands to recursively delete a directory tree or zip a file differ by operating system.  Many of these simple operations are required for the primary publication and installation tasks and are provided directly as a convenience.

These commands are found in the **cmds** object in biddle.js near the top of the file.

## .biddlerc File
An application may contain a file named *.biddlerc* to serve as a preset.  This file will contain JSON in this format:
```
{
    "directories": {
        "applications": "applications",
        "downloads"   : "downloads",
        "publications": "publications"
    },
    "exclusions" : [
        "file", "file", "directory"
    ]
}
```
There are two key properties supported in the *.biddlerc* file: *directories* and *exclusions*.  The *directories* object allows application specific defaults to be defined for the three directories that biddle will write to.  The addresses are relative to the application directory and absolute addresses are also supported.  The *exclusions* object allows an application specific list of files or directories to exclude when running the **publish** command.

## Publication and the published.json File
The published.json file stores data on applications published by biddle with the following schema:

    {
        "applicationName": {
            "directory": "path/to/application",
            "latest"   : "latestVersion",
            "versions" : [
                "oldest version", "older version", "version string", "latest version"
            ]
        }
    }

### Naming Conflicts
If an application is published with the same name an version as a previously published application biddle with throw an error.  If an application is published with the same name as an existing application it will be installed to the same location as the existing application.  If a new location is desired first unpublish the application and then publish it to the desired location.

Since applications are stored by name an application of a given name may only exist once in biddle.  Should a name conflict arise a possible solution is to run multiple instances of biddle for different types of applications.  With biddle there isn't any central repository so another solution is to simply rename an application to something unique prior to publication.

### Directory
The default publication point is the *publications* directory in biddle.  An application may be published to any location permitted by the operating system.  The published location is stored as the *directory* property in the published.json file.

### Versions
Versions in biddle are completely free form.  [SemVer](http://semver.org/) is strongly encourage, but any string is accepted.

### Latest Version
In addition to publishing a specified version of an application biddle will also create a *latest* version in the following criteria is met:

* The current version is the first publication
* larger than the immediately preceding version where larger means sorts lower after a JavaScript string sort.

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

## Global Installation Requirements

### bin File
An application must have a bin file named `bin\myApplicationName`.  The *myApplicationName* file has no file extension and should be named exactly like the application's parent directory, for example: *prettydiff/bin/prettydiff*.  This file contains two things:

1. A shebang statement
2. A single execution instruction

An example of the file used by biddle:

    #!/usr/bin/env node
    require("../biddle.js");

The shebang statement is only used by POSIX systems.  This statement defines the environment to execute the application.  biddle is not capable of writing the bin file automatically as it cannot guess at an applications execution environment.  In the example shebang statement the executing environment is Node.js.

The second line of code refers to the execution instruction, which in the biddle example tells Node.js to execute a file in the parent directory named biddle.js.

### Windows Execution
Windows requires a file named `cmd\index.cmd`. This file allows command line execution of an application file that isn't a ".exe" file.  The cmd file will point to the application's bin file and define the executing environment for the given application.  Here is an example used by biddle where the environment is Node.js.

    @IF EXIST "%~dp0\node.exe" (
        "%~dp0\node.exe" "..\bin\index" %*
    ) ELSE (
        node "..\bin\index" %*
    )

Windows requires execution of the global command from an administrative terminal.  biddle cannot tell if it is executing in an administrative terminal and so it is not removed from the Windows path during the **uninstall** command.  In Windows applications must be removed from the path with the global command before the application is uninstalled.

    biddle global myApplicationName remove

### POSIX Execution
If an application is uninstalled by biddle it will be removed from the PATH environmental variable automatically.  Otherwise it will require a separate prior step to remove the application from the PATH.

Examples:

    biddle uninstall myApplication

or

    biddle global myApplication remove

### Restarting the Terminal
Once the **global** command is executed the result is not available until the terminal is restarted.  In POSIX systems biddle will output a command that, if executed, will allow immediate global availability of the application.
