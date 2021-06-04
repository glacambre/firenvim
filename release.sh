#!/bin/sh -e

if ! [ -e ./package.json ] ; then
        echo "Not in firenvim repository. Aborting."
        exit 1
fi

if [ "$1" = "" ] ; then
        echo "No new version specified. Aborting."
        exit 1
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "master" ] ; then
        echo "Not on master. Aborting."
        exit 1
fi

if ! git diff --quiet --exit-code ; then
        echo "Git working directory unclean. Aborting."
        exit 1
fi

if ! git diff --cached --quiet --exit-code ; then
        echo "Git staged area unclean. Aborting."
        exit 1
fi

git fetch origin master
if ! git diff --quiet --exit-code origin/master ; then
        echo "Local master is different from origin master. Aborting"
        exit 1
fi

newMajor="$(echo "$1" | cut -d. -f1)"
newMinor="$(echo "$1" | cut -d. -f2)"
newPatch="$(echo "$1" | cut -d. -f3)"

oldVersion="$(grep '"version": "\(.\+\)"' package.json | grep -o '[0-9.]\+')"
oldMajor="$(echo "$oldVersion" | cut -d. -f1)"
oldMinor="$(echo "$oldVersion" | cut -d. -f2)"
oldPatch="$(echo "$oldVersion" | cut -d. -f3)"

if [ "$oldMajor" = "$newMajor" ] ; then
        if [ "$oldMinor" = "$newMinor" ] ; then
                if [ "$((oldPatch + 1))" != "$newPatch" ] ; then
                        echo "New version has same minor and major but patch doesn't follow."
                        exit 1
                fi
        elif [ "$((oldMinor + 1))" -eq "$newMinor" ] ; then
                if [ "$newPatch" != 0 ] ; then
                        echo "New version has new minor but patch isn't 0."
                        exit 1
                fi
        else
                echo "New version has same major but minor doesn't follow."
                exit 1
        fi
elif [ "$((oldMajor + 1))" -eq "$newMajor" ] ; then
        if [ "$newMinor" != 0 ] ; then
                echo "New version has new major but minor isn't 0."
                exit 1
        fi
        if [ "$newPatch" != 0 ] ; then
                echo "New version has new major but patch isn't 0."
                exit 1
        fi
else
        echo "New version doesn't follow previous one."
        exit 1
fi

oldVersion="$oldMajor.$oldMinor.$oldPatch"
newVersion="$newMajor.$newMinor.$newPatch"

echo "Updating firenvim from v$oldVersion to v$newVersion."
# First, edit package info
sed -i "s/\"version\": \"$oldVersion\"/\"version\": \"$newVersion\"/" package.json

# Then, do manual update/editing
npm install
npm audit fix

# Make sure none of the files have changed, except for package-lock.json
if [ "$(git diff --name-only | grep -v "package\(-lock\)\?.json")" != "" ] ; then
        echo "Some files have been modified. Aborting."
        exit 1
fi

# npm run test takes care of building the extension in test mode
npm run test-firefox
npm run test-chrome

# now we need a release build
npm run build

# lint firefox add-on to make sure we'll be able to publish it
"$(npm bin)/addons-linter" target/xpi/firefox-latest.xpi

# Add finishing touches to chrome manifest
sed 's/"key":\s*"[^"]*",//' -i target/chrome/manifest.json

# Generate bundles that need to be uploaded to chrome/firefox stores
rm -f target/chrome.zip
zip --junk-paths target/chrome.zip target/chrome/*
source_files="$(echo ./* | sed s@./node_modules@@ | sed s@./target@@)"
rm -f target/firenvim-firefox-sources.tar.gz
tar -cvzf target/firenvim-firefox-sources.tar.gz $source_files
rm -f target/firenvim-thunderbird-sources.tar.gr
tar -cvzf target/firenvim-thunderbird-sources.tar.gz $source_files

# Prepare commit message
COMMIT_TEMPLATE="/tmp/firenvim_release_message"
echo "package.json: bump version $oldVersion -> $newVersion" > "$COMMIT_TEMPLATE"
echo "" >> "$COMMIT_TEMPLATE"
git log --pretty=oneline --abbrev-commit --invert-grep --grep='dependabot' "v$oldVersion..HEAD" >> "$COMMIT_TEMPLATE"

# Everything went fine, we can commit our changes, tag them, push them
git add package.json package-lock.json
git commit -t "$COMMIT_TEMPLATE"
git tag --delete "v$newVersion" 2>/dev/null || true
git tag "v$newVersion" 

git push
git push --tags

firefox --private-window 'https://chrome.google.com/webstore/devconsole/g06704558984641971849/egpjdkipkomnmjhjmdamaniclmdlobbo/edit?hl=en'
sleep 1
firefox --private-window 'https://addons.mozilla.org/en-US/developers/addon/firenvim/versions/submit/'
sleep 1
firefox --private-window 'https://addons.thunderbird.net/en-US/developers/addon/firenvim/versions/submit/'
