package com.knowledge.message.provider;

import java.util.List;

import javax.mail.internet.MimeMessage;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import com.knowledge.core.message.core.message.MessageType;
import com.knowledge.core.message.core.message.SendMessageRequest;
import com.knowledge.core.message.core.message.SendMessageResult;
import com.knowledge.core.message.core.message.email.EmailMessage;
import com.knowledge.core.tool.KnowledgeUser;

import lombok.Getter;
import lombok.SneakyThrows;

@Service
public class EmailMessageProvider implements IMessageProvider<EmailMessage> {

    @Getter
    private MessageType type = MessageType.EMAIL;
    @Autowired
    private JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String officalAccount;

    @Override
    @SneakyThrows
    public SendMessageResult sendSingleMessage(SendMessageRequest<EmailMessage> request) {
        EmailMessage message = request.getMessage();
        KnowledgeUser user = request.getTargetUsers().get(0);
        MimeMessage mimeMessage = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, false);
        // 发件人邮箱和名称
        helper.setFrom(officalAccount, "knowledge");
        // 收件人邮箱
        helper.setTo(user.getAccount());
        // 邮件标题
        helper.setSubject(message.getTitle());
        // 邮件正文，第二个参数表示是否是HTML正文
        helper.setText(message.getBody().toString(), true);
        return SendMessageResult.success();
    }

    @Override
    public SendMessageResult sendGroupMessages(SendMessageRequest<EmailMessage> request) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'sendGroupMessages'");
    }

    @Override
    public SendMessageResult resend(List<EmailMessage> messages) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'resend'");
    }

    @Override
    public boolean resend(Object message, Long userId) {
        // TODO Auto-generated method stub
        throw new UnsupportedOperationException("Unimplemented method 'resend'");
    }

}
