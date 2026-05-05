@{
    Severity = @('Error', 'Warning')

    ExcludeRules = @(
        # Write-Host is intentional in interactive bootstrap scripts
        'PSAvoidUsingWriteHost'

        # Private helpers don't need approved verbs (Refresh-Path, etc.)
        'PSUseApprovedVerbs'

        # BOM encoding not required — repo uses UTF-8 without BOM
        'PSUseBOMForUnicodeEncodedFile'
    )
}
