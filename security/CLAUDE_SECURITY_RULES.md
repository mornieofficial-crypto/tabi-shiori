# Claude Security Rules

- security/SECURITY_BASELINE.md と SECURITY_PROFILE.md を確認する
- 秘密情報をコード・Git・ログへ出さない
- 新しい個人情報収集、外部通信、SDK、認証、DB、課金、権限変更は勝手に追加しない
- 外部入力は検証する
- セキュリティに影響する変更は完了報告で明示する
- 重大な懸念やBaselineとの矛盾があれば実装を止めて報告する