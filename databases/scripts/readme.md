# toro-infra


Here we define and deploy all the foundational infrastructure required on aws.

For this we use cloudformation(cfn) templates and ansible to upload and manage them. Thats what this repo defines. Right now (as of early 2023) we do NOT use nested CF templates however it is theoretically possible. I just dont like Cloudfromations templating language as much as if I was to use Jinja templates.


This repo has several Playbooks defined. One per AWS Account(infra_dev, infra_prod) and one for development of new infra(infra_testing).(infra_dev, infra_prod and infra_testing).

We have several AWS accounts (Production and Development). Each contains several stages

To get up and running you need python 3 installed and a virtual environement

Windows is not supported.

## Ansible Strucuture and terminolgy

Playbooks Specify the Roles to run and which Vars to use with those Roles.
Roles contain Tasks that use these Vars.

1. Playbooks have many Plays.
2. Plays have Vars and Roles.
3. Roles have Tasks.
4. Tasks use Vars.

### Playbooks
Each Playbook defines an Account and the Plays the different resouces to be created within the account.
Playbooks live in the playbooks folder.

Each Playbook is broadly similar the only difference is the account and the stages they deploy.
They all follow the same pattern - Shared roles are run first. These define things that are per account, such as DomainNames, Hosted zones and Artifact Buckets. Stage roles run second and create the resources that are used by each stage indervidually.

## Why Shared Playbooks?:
We have shared Playbooks because some things are account level AND it can sometimes take a long time to make changes to resources so its easier just to share them. For example DNS related activities.
We also have shared resources for cost management reasons(its cheaper duuhh)

IMPORTANT: Roles must be run in the correct order within the Play. However each stage checks for the resources it needs before making any changes and so you will see an error message along the lines of "Stack Undefined" if its dependencies are not present.

### Roles

I have defined that each Role has a single responsibility with the Resources it creates. Such as stage_cognito creating our Cognito user pool and all its relevant parts. Each of these should roughly be a limb on the tree that is our infrastructure. Depending on other Roles *Can* happen but isnt encoraged. All Roles will should check for the Stacks they depend on *before* making changes.

A Role generally consistes of:
1. A cfn stack lookup for any dependencies
2. A cfn stack definition in the form of a yaml cfn template
3. A cfn stack deploy for the resources we want
4. A cfn stack deploy for the hosted zone config to link the resource to the internet.

Roles can deploy several cfn stacks.

Roles are directory strucutres and *Should* be self-contained.
* files - Containes cfn templates. These should be prefixed with cnf. (not Jinja templates)
* tasks - The Roles' tasks defined inside main.yml
* vars - The default vars for this task to use. They will be overwritten using "Ansible Variable Precidence" Rules if they are set in other files(google it). We use them primaraly for setting tags to be attached to CF stacks deployed by that Role.

#### Role dev notes:
* Use amazon.aws.cloudformation_info role to check for existing stacks and collect their outputs
* If its not possible to query the stack for the information you want it is possible to use the AWS CLI and parse the result. You can find an example of this in the stage_graphql role.
* I have decided that AWS Tags for each stage_role are the same for every stack deployed in that role for simplicity.
* Due to the time taken to create a resource and some weird cfn/cloudfront behaviour we typically create the resource in one template and then do the cloudfront - Hostedzone mapping in a second template.

#### Roles - Helpers
It is possible to import Roles from other places.
I have extracted some frequently used roles into tasks beginning with the name "helper". These are designed to be used in any role and reduce some repition as well as allowing the task to focus on its reason for existing.


### Vars

Vars are store inside the group_vars folder. This name is an ansible convention.
The Vars are in YAML format and specify the properties that are different between each environment and account.
* group_vars/accounts/development contains the vars for the development account
* group_vars/accounts/development contains the vars for the production account
* group_vars/accounts/\<account>/account_vars.yml contains the vars that are specific to that account. Such as what the domain is or which is the "live" stage

Vars files that begin with stage_ corrospond to the stages running on that Account.

Each Play requires the relevant account_vars file and ONLY one stage_ file. If 2 are specified then one will overwrite the other.

If the Play is only for the account and only uses "shared" roles then it only needs the relevant account_vars file


# How to Run

You need Python 3.11.7

We are using ansible vault for encrypting variables. To run the playbooks successfully, we need to provide a password file. (Step 7)


1. Install the virtual environment
`python3 -m venv venv`

2. Activate the virtualenv for use
`source venv/bin/activate`

3. Update Pip
`pip install --upgrade pip`

4. Install the ansible dependencies
`pip install -r requirements.txt`

5. Install ansible-galaxy dependencies
`ansible-galaxy install -r requirements.yml`

6. Install & build lambda dependencies with yarn
In the project root directory:
- `yarn install`
- `yarn prebuild` (removing any existing dist directory)
- `yarn build` (bundles the lambdas)

7. Provide ansible vault password file
- Create a file named 'vault_pass' in root directory, without file extension
- Type in the vault password in this file (you can find this in the repos's settings -> CI/CD variables in GitLab)
- `export ANSIBLE_VAULT_PASSWORD_FILE="vault_pass"`

8. Run the ansible playbook
> * print help: `./push.sh -h`
> * run on specific stage ( -s ): `./push.sh -a <account> -s <stage_name>`
> * deploy only common infra ( -c ): `./push.sh -a <account> -c`
> * deploy stage and common infra ( -c ): `./push.sh -a <account> -s <stage_name> -c`
> * Skip safety checks ( -F ): `./push.sh -s <stage_name> -a <account> -F`
> * Regen Certs [this will kill your stage]( -c ): `./push.sh -a <account> -s <stage_name> -c -r`

If you provide the word skip it will skip asking "are you sure" when deploying to a live env

### examples:
./push.sh -a development -s reinardus -F

./push.sh -a development -s alex -F

## Crash recovery tips

If the entire solution is dead and you need to start from the beginning.
Create a new hosted zone and update the ID. You can try using the Hosted Zone cf template but it will be quicker to manually recreate it and update the reference.
    If you manually create the Hosted Zone you MUST copy the NS servers into the registered domain.
    You MUST MUST Copy the NS servers FROM the Hosted Zone TO the Domain. It ONLY works this way around. Also be patient it takes time for this update to propagate.
    1. Create Hosted Zone
      * route53 > Hosted Zones
    2. Copy NS servers(all 4 so put them somewhere nice)
    3. Update NS servers on the domain
      * Domains > Registered domains > Name Servers(Right hand side update all of them)

# TORO Toolbox - for CodeArtifact

Toolbox playbook & role definition to create CodeArtifact resources,
for pushing & pulling TORO Libraries

We have a playbook called `infra_account_toolbox.yml`
which contains a role, `toolbox_code_artifact`

This deploys a cfn stack which creates CodeArtifact resources:

- Domain named *toro*
- Repositories in this domain named *releases* and *snapshots*

To run:
- `./push-toolbox.sh`

## Future plans

* Delegate Hostedzones config to specific account depending on stage
* Use nested CF templates
* Add deployment to gitlab
* Add timeout to cert generation
* Come up with a better way of handling account level and stage level deployments
* Come up with a better way of managing Certs
* Come up with a better way of managing hostedZones
