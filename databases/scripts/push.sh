#!/bin/bash
ANSIBLE_STDOUT_CALLBACK=yaml

# Takes the input provided to ./push.sh


showHelp() {
# `cat << EOF` This means that cat should stop reading when EOF is detected
cat << EOF
Usage: ./push.sh -s <stage> -a <account> [-cFrh]
Deploys the given stage to the given account

-h,   Display help.

-s,   Specify stage to deploy. If no stage provided (and -c specified) deploy only common.

-a,   Specify account to deploy stage too.(requires stage to be enabled on that account).

-c,   Deploy account level common(shared) infrastructure.

-F,   Skip confirmation questions.

-r,   Force certificate regen(requires the full deletion of the stack so only included for debugging not even needed when creating a new stage).

EOF
# EOF is found above and hence cat command stops reading. This is equivalent to echo but much neater when printing out.
}


# echo  "Deploy stage $stage_name on $account."
ansible-playbook -i hosts infra.yml
