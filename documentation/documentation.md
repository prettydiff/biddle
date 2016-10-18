# biddle, documentation

## Commands

### Command Overview
biddle operates with the convention: `biddle command argument1 argument2`

The following table describes which commands require arguments and which commands run locally without a network connection.  A second argument is required for the **copy** command and either optional or unused for all other commands.

Command|Local Only|Argument Type|Second Argument
---|---|---|---
copy|yes|file or directory|directory
get|optional|file|none
global|yes|none|none
hash|yes|file|none
help|yes|number|none
install|optional|zip file|directory
list|yes|"*installed*" or "*published*"|none
markdown|yes|markdown file|number
publish|yes|directory|directory
remove|yes|file or directory|none
status|yes|none or application name|none
test|no|none|none
uninstall|yes|application name|none
unpublish|yes|application name|none
unzip|yes|zip file|directory
zip|yes|file or directory|directory

### cmds Object
Some biddle commands require OS specific actions.  For instance the commands to recursively delete a directory tree, copy a directory tree, or zip a file differ by operating system.  Many of these simple operations are required for the primary publication and installation tasks and are provided directly as a convenience.

These commands are found in the **cmds** object in biddle.js near the top of the file.
