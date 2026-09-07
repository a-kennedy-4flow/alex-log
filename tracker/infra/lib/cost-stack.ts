// What the account is allowed to spend.
//
// Separate from the application stack so that it outlives a rebuild. The
// application stack has already been torn down twice and a budget that goes
// with it warns nobody during the window.
//
// The budget covers the whole account rather than a set of tagged resources.
// Because a) account 517025126224 runs this application and nothing else. b) a
// tag filter needs the tag activated for cost allocation in the management
// account. c) an activated tag applies only from that day so it reports nothing
// for the month it was turned on.

import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib'
import * as budgets from 'aws-cdk-lib/aws-budgets'
import type { Construct } from 'constructs'

export interface CostStackProps extends StackProps {
  /** Where an alert goes. A budget with no subscriber warns nobody. */
  alertEmail: string
  /** The monthly ceiling. */
  monthlyLimit: number
  /**
   * The currency of the limit. It must match the currency the account is billed
   * in or the comparison is meaningless.
   */
  currency: string
}

export class CostStack extends Stack {
  constructor(scope: Construct, id: string, props: CostStackProps) {
    super(scope, id, props)

    const subscribers = [{ subscriptionType: 'EMAIL', address: props.alertEmail }]

    /**
     * Three warnings rather than one. The first is early enough to look into.
     * The second says the month is already over. The forecast catches a rise
     * that has not yet added up.
     */
    const notify = (
      notificationType: 'ACTUAL' | 'FORECASTED',
      threshold: number,
    ): budgets.CfnBudget.NotificationWithSubscribersProperty => ({
      notification: {
        comparisonOperator: 'GREATER_THAN',
        notificationType,
        threshold,
        thresholdType: 'PERCENTAGE',
      },
      subscribers,
    })

    new budgets.CfnBudget(this, 'Monthly', {
      budget: {
        budgetName: 'Tracker monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyLimit, unit: props.currency },
        // Tax and support are counted. Credits are not deducted so the figure
        // is what the workload costs rather than what is invoiced.
        costTypes: {
          includeTax: true,
          includeSubscription: true,
          includeSupport: true,
          includeCredit: false,
          includeRefund: false,
          useBlended: false,
        },
      },
      notificationsWithSubscribers: [notify('ACTUAL', 50), notify('ACTUAL', 100), notify('FORECASTED', 100)],
    })

    // A monthly ceiling is only breached once. A daily one catches a rise on
    // the day it starts rather than at the end of the month.
    const dailyLimit = Math.max(1, Math.ceil(props.monthlyLimit / 10))

    new budgets.CfnBudget(this, 'Daily', {
      budget: {
        budgetName: 'Tracker daily',
        budgetType: 'COST',
        timeUnit: 'DAILY',
        budgetLimit: { amount: dailyLimit, unit: props.currency },
        costTypes: { includeTax: true, includeSubscription: true, useBlended: false },
      },
      notificationsWithSubscribers: [notify('ACTUAL', 100)],
    })

    new CfnOutput(this, 'BudgetLimit', {
      value: `${props.monthlyLimit} ${props.currency} a month`,
    })
    new CfnOutput(this, 'DailyCeiling', { value: `${dailyLimit} ${props.currency} a day` })
    new CfnOutput(this, 'AlertsTo', { value: props.alertEmail })
  }
}
