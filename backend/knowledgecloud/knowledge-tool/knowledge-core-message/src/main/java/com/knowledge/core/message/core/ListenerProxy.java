package com.knowledge.core.message.core;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;

@Slf4j
@AllArgsConstructor
public class ListenerProxy implements InvocationHandler {

	private Method method;


	@Override
	public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
		if (method.getName().equals(this.method.getName())) {
			this.method.invoke(proxy, args);
		}
		return null;
	}
}
