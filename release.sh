#!/bin/sh -e

if ! [ -e ./package.json ] ; then
        echo "Not in firenvim repository. Aborting."
        exit 1
fi

if [ "$1" = "" ] ; then
        echo "No new version specified. Aborting."
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
npm audit fix
npm install
npm run build
npm run test firefox
npm run test chrome

# Add finishing touches to chrome manifest
chromeManifest="$(paste -sd' ' < target/chrome/manifest.json | sed 's/,\s*"key":\s*"[^"]*"//')"
echo "$chromeManifest" > target/chrome/manifest.json

# Generate bundles that need to be uploaded to chrome/firefox stores
rm -f target/chrome.zip
zip --junk-paths target/chrome.zip target/chrome/*
source_files="$(echo ./* | sed s@./node_modules@@ | sed s@./target@@)"
rm -f target/firenvim-sources.tar.gz
tar -cvzf target/firenvim-sources.tar.gz $source_files

# Everything went fine, we can commit our changes, tag them, push them
git add package.json package-lock.json
git commit -m "package.json: bump version $oldVersion -> $newVersion"
git tag --delete "v$newVersion" || true
git tag "v$newVersion" 

git push
git push --tags

firefox --private-window 'https://chrome.google.com/webstore/devconsole/g06704558984641971849/egpjdkipkomnmjhjmdamaniclmdlobbo/edit?hl=en'
firefox --private-window 'https://addons.mozilla.org/en-US/developers/addon/firenvim/versions/submit/'
