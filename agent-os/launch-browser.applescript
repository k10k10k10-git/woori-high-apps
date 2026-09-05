set agentOsUid to do shell script "/usr/bin/id -u"
set tokenFilePath to "/tmp/agent-os-" & agentOsUid & "/session-token"
set tokenContents to read (POSIX file tokenFilePath) as «class utf8»
set sessionToken to paragraph 1 of tokenContents

if (length of sessionToken) is not 43 then error "Agent OS 토큰 길이가 올바르지 않습니다."
set allowedCharacters to "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
repeat with tokenCharacter in characters of sessionToken
  if allowedCharacters does not contain (tokenCharacter as text) then error "Agent OS 토큰 형식이 올바르지 않습니다."
end repeat

open location ("http://127.0.0.1:5599/#token=" & sessionToken)
