'use client'

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, CirclePlay, GithubIcon } from "lucide-react";
import React from "react";
import LogoCloud from "./logo-cloud";

const Hero = () => {

  const handleClick = () => {
   window.open("https://kotion.top:888", "_blank");
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] flex flex-col items-center py-20 px-6">
      <div className="md:mt-6 flex items-center justify-center">
        <div className="text-center max-w-2xl">
          <h1 className="mt-6 max-w-[20ch] text-3xl xs:text-4xl sm:text-5xl md:text-6xl font-bold !leading-[1.2] tracking-tight">
            用全新的方式构建你的工作流
          </h1>
          <p className="mt-6 max-w-[60ch] xs:text-lg">
            Connect every things ! Knowledge 构建了一个插件系统，能让你根据自己的习惯，轻松构建属于自己的工作流！
          </p>
          <div className="mt-12 flex flex-col sm:flex-row items-center sm:justify-center gap-4">
            <Button
              onClick={handleClick}
              size="lg"
              className="w-full sm:w-auto rounded-full text-base"
            >
              Get Started <ArrowUpRight className="!h-5 !w-5" />
            </Button>
            <Button
              size="lg"
              className="w-full sm:w-auto rounded-full text-base"
            >
              Github <GithubIcon className="!h-5 !w-5" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto rounded-full text-base shadow-none"
            >
              <CirclePlay className="!h-5 !w-5" /> Watch Demo
            </Button>
          </div>
        </div>
      </div>
      {/* <LogoCloud className="mt-24 max-w-3xl mx-auto" /> */}
    </div>
  );
};

export default Hero;
