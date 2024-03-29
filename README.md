# <img src="public/icons/icon96.png" align="absmiddle"> Github-SSH-To-URI-Chrome-Extension
![Tests](https://github.com/NickSpaghetti/Github-SSH-To-URI-Chrome-Extension/actions/workflows/cron-test.yml/badge.svg)

## Installing the Extension
You can install the Chrome extension from the [store](https://chrome.google.com/webstore/detail/github-terraform-sources/opnokndmmanolamphnpknbpdkdbcfidl?hl=en&authuser=0).

## Using the extension
### on page load
When the page loads the extension will try and parse the sources of your modules in your terraform file from an ssh to a clickable uri.  The extension supports parsing `.tf` and `.hcl` file types.  You must grant the extensions permission to have access to [github](https://github.com). See the [Devloping Locally Section](#developing-locally)
### viewing all sources
Navigate to a GitHub page where there is Terraform code and click on the extension.  If no modules are found then `No Moduels found` will be displayed on the pop-up.
If a modules is found then a table displaying the module name and source type will be shown.  The module name is a hyperlink to the github page of that module. 
# How to contribute
I would love for you to contribute to the source code and make the extension even better.

## Contributing

### Submitting a Pull Request
Before you submit your pull request consider the following guidelines:
1. Make sure you have signed commits enabled. You can do that by following GitHubs guide [here](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
1. Please write a summary of what your change does.
1. Your PR must be reviewed by one of the code owners before you can merge into main.

## Developing Locally
Clone this repository and run.
```
cd Github-SSH-To-URI-Chrome-Extension
yarn install
yarn build
```
This will generate a dist folder where the javascript is exported to. 
Then open up chrome and paste `chrome://extensions/` in the search bar. Once the page has loaded click Load unpacked Extension.
Navigate to the `dist` folder and click okay.  To see the extension you must also enable dev mode.
You must also allow the Extension to have access to [github](https://github.com) found in the Site access setting on the `chrome://extensions` page.
Alternatively the extension will flash white in the corner when you navigate to [github](https://github.com) click the Icon to allow the extension to have access to your page.
Note you must do this each time you run `yarn build` and update the extension.

# Testing
This project uses [jest](https://jestjs.io/docs/getting-started) and [cypress](https://docs.cypress.io/guides/tooling/typescript-support).  
### To run the Jest unit tests 
```yarn tests```

### To run cypress e2e testing run:
```cd tests\cypress\cypress
   yarn cypress:run
```
To see cypress running instead run ```yarn cypress:open```

# Credit
1. This icon was created with the assistance of DALL·E 2.
1. Thanks to [bec-uk](https://github.com/benc-uk) for his work on [hcl2-parser](https://github.com/benc-uk/hcl2-parser).

