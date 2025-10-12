"use client"
import React from "react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@kn/ui"
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export default () => {
    const { setTheme  } = useTheme()
    return <>
            <nav className="sticky bg-popover top-0 z-50 shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex items-center">
                            <div className="flex-shrink-0 flex items-center">
                                {/* <img className="h-8 w-auto" src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/db52835a91294c1995afd744e9c2df91~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738781&x-signature=%2FxikC6RAqb%2FUZ8aGUsDWvEvIUxc%3D" alt="Notion Logo" /> */}
                                <span className="ml-2 text-xl font-semibold text-notion">Kotion</span>
                            </div>
                            <div className="hidden md:ml-6 md:flex md:space-x-8 ">
                                <a href="#features" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Features</a>
                                <a href="#templates" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Templates</a>
                                <a href="#testimonials" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Testimonials</a>
                                <a href="#pricing" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Pricing</a>
                                <a href="#" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Templates</a>
                                <a href="#" className="border-transparent text-notion-light hover:text-notion inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium">Plugins</a>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className=" rounded-full">
                                        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                        <span className="sr-only">Toggle theme</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => setTheme("light")}>
                                        Light
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                                        Dark
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setTheme("system")}>
                                        System
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <div className="ml-4 flex items-center gap-2 md:ml-6">
                                <Button size="sm">Log in</Button>
                                <Button size="sm" variant="outline">Sign up</Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="md:hidden" id="mobile-menu">
                    <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                        <a href="#features" className="block px-3 py-2 rounded-md text-base font-medium">Features</a>
                        <a href="#templates" className="block px-3 py-2 rounded-md text-base font-medium">Templates</a>
                        <a href="#testimonials" className="block px-3 py-2 rounded-md text-base font-medium">Testimonials</a>
                        <a href="#pricing" className="block px-3 py-2 rounded-md text-base font-medium">Pricing</a>
                    </div>
                </div>
            </nav>

            <section className="py-16 md:py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row items-center gap-2">
                        <div className="md:w-1/2 mb-8 md:mb-0">
                            <h1 className="text-4xl md:text-5xl font-bold text-notion mb-4">All-in-one workspace for your notes, tasks, wikis, and databases.</h1>
                            <p className="text-lg text-notion-light mb-8">Customize Kotion to work the way you do. Write, plan, collaborate, and get organized—all in one place.</p>
                            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                                <Button>Get started for free</Button>
                                <Button variant="outline">View templates</Button>
                                <Button variant="outline" className="flex items-center gap-1">
                                    <i className="fa fa-brands fa-github text-[30px]"></i>
                                    Github
                                </Button>
                            </div>
                        </div>
                        <div className="md:w-1/2">
                            <img src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ac7e6d3084d048938800c34c1aa3127c~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738771&x-signature=oLogESkc%2Fuv7VCvgrbWCwXMeXQQ%3D" alt="Notion Interface" className="rounded-lg shadow-lg w-full" />
                        </div>
                    </div>
                </div>
            </section>

            <section id="features" className="py-16 bg-muted/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-notion mb-4">Build your workflow</h2>
                        <p className="text-lg text-notion-light max-w-3xl mx-auto">Create custom tools to manage any project or workflow. From simple to-do lists to complex databases, Notion adapts to your needs.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="features-container">
                        <div className="notion-block" draggable="true">
                            <div className="flex items-center mb-4">
                                <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded-md mr-3">
                                    <i className="fa fa-file-text-o text-primary" aria-hidden="true"></i>
                                </div>
                                <h3 className="text-xl font-semibold text-notion">Write & Edit</h3>
                            </div>
                            <p className="text-notion-light">Create beautiful documents with rich text, images, tables, and more. Format your notes with headings, lists, and quotes.</p>
                        </div>

                        <div className="notion-block" draggable="true">
                            <div className="flex items-center mb-4">
                                <div className="bg-green-100 dark:bg-green-900 p-2 rounded-md mr-3">
                                    <i className="fa fa-tasks text-green-600 dark:text-green-400" aria-hidden="true"></i>
                                </div>
                                <h3 className="text-xl font-semibold text-notion">Tasks & Projects</h3>
                            </div>
                            <p className="text-notion-light">Manage your tasks with checkboxes, due dates, and priorities. Create project timelines and track progress with visual tools.</p>
                        </div>

                        <div className="notion-block" draggable="true">
                            <div className="flex items-center mb-4">
                                <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded-md mr-3">
                                    <i className="fa fa-database text-purple-600 dark:text-purple-400" aria-hidden="true"></i>
                                </div>
                                <h3 className="text-xl font-semibold text-notion">Databases</h3>
                            </div>
                            <p className="text-notion-light">Build custom databases to organize anything—from contacts to inventory. Use tables, boards, calendars, and galleries to visualize your data.</p>
                        </div>

                        <div className="notion-block" draggable="true">
                            <div className="flex items-center mb-4">
                                <div className="bg-yellow-100 dark:bg-yellow-900 p-2 rounded-md mr-3">
                                    <i className="fa fa-users text-yellow-600 dark:text-yellow-400" aria-hidden="true"></i>
                                </div>
                                <h3 className="text-xl font-semibold text-notion">Collaborate</h3>
                            </div>
                            <p className="text-notion-light">Work together in real-time with your team. Comment on documents, assign tasks, and share your workspace with others.</p>
                        </div>

                        <div className="notion-block" draggable="true">
                            <div className="flex items-center mb-4">
                                <div className="bg-red-100 dark:bg-red-900 p-2 rounded-md mr-3">
                                    <i className="fa fa-link text-red-600 dark:text-red-400" aria-hidden="true"></i>
                                </div>
                                <h3 className="text-xl font-semibold text-notion">Connect Everything</h3>
                            </div>
                            <p className="text-notion-light">Link pages together to create a knowledge base. Turn any text into a link to another page, making it easy to navigate your workspace.</p>
                        </div>

                        <div className="notion-block" draggable="true">
                            <div className="flex items-center mb-4">
                                <div className="bg-indigo-100 dark:bg-indigo-900 p-2 rounded-md mr-3">
                                    <i className="fa fa-plug text-indigo-600 dark:text-indigo-400" aria-hidden="true"></i>
                                </div>
                                <h3 className="text-xl font-semibold text-notion">Integrate</h3>
                            </div>
                            <p className="text-notion-light">Connect Notion with your favorite tools. Integrate with Google Drive, Slack, Zoom, and many more to streamline your workflow.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section id="templates" className="py-16 ">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-notion mb-4">Ready-to-use templates</h2>
                        <p className="text-lg text-notion-light max-w-3xl mx-auto">Get started quickly with our library of templates. Customize them to fit your needs or build your own from scratch.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="notion-block">
                            <img src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/5ceb61273e4a4a06bbfb9dd9f04d9dc2~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738785&x-signature=hRoPfUYkt6QwmzFiCT7ctRqhYUk%3D" alt="Project Management Template" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h3 className="text-xl font-semibold text-notion mb-2">Project Management</h3>
                            <p className="text-notion-light mb-4">Track tasks, deadlines, and progress for your projects. Perfect for teams and individuals.</p>
                            <Button variant="outline">
                                Use template <i className="fa fa-arrow-right ml-2" aria-hidden="true"></i>
                            </Button>
                        </div>

                        <div className="notion-block">
                            <img src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/4c69cb924add43e8af9ccd811451be1c~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738788&x-signature=b2bfQRxYl5ipzk3dshgzKCVn2LM%3D" alt="Team Collaboration Template" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h3 className="text-xl font-semibold text-notion mb-2">Team Collaboration</h3>
                            <p className="text-notion-light mb-4">Create a central hub for your team. Share documents, assign tasks, and track progress together.</p>
                            <Button variant="outline">
                                Use template <i className="fa fa-arrow-right ml-2" aria-hidden="true"></i>
                            </Button>
                        </div>

                        <div className="notion-block">
                            <img src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ac7e6d3084d048938800c34c1aa3127c~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738771&x-signature=oLogESkc%2Fuv7VCvgrbWCwXMeXQQ%3D" alt="Personal Wiki Template" className="w-full h-48 object-cover rounded-md mb-4" />
                            <h3 className="text-xl font-semibold text-notion mb-2">Personal Wiki</h3>
                            <p className="text-notion-light mb-4">Build a personal knowledge base. Organize your notes, ideas, and resources in one place.</p>
                            <Button variant="outline">
                                Use template <i className="fa fa-arrow-right ml-2" aria-hidden="true"></i>
                            </Button>
                        </div>
                    </div>

                    <div className="text-center mt-10">
                        <Button className="px-6 py-3 border  rounded-md text-base font-medium">Browse all templates</Button>
                    </div>
                </div>
            </section>

            <section id="testimonials" className="py-16 bg-muted/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-notion mb-4">What people are saying</h2>
                        <p className="text-lg text-notion-light max-w-3xl mx-auto">Join millions of users who are using Notion to organize their work and life.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="notion-block">
                            <div className="flex items-center mb-4">
                                <div className="text-yellow-400 flex">
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                </div>
                            </div>
                            <p className="text-notion-light mb-6">"Notion has completely transformed how my team works. We've replaced multiple tools with a single workspace that adapts to our needs."</p>
                            <div className="flex items-center">
                                <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-full mr-3"></div>
                                <div>
                                    <h4 className="text-notion font-medium">Sarah Johnson</h4>
                                    <p className="text-notion-light text-sm">Product Manager, Tech Co.</p>
                                </div>
                            </div>
                        </div>

                        <div className="notion-block">
                            <div className="flex items-center mb-4">
                                <div className="text-yellow-400 flex">
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                </div>
                            </div>
                            <p className="text-notion-light mb-6">"I use Notion for everything—from managing my personal projects to organizing my thoughts. It's flexible, intuitive, and beautiful."</p>
                            <div className="flex items-center">
                                <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-full mr-3"></div>
                                <div>
                                    <h4 className="text-notion font-medium">Michael Chen</h4>
                                    <p className="text-notion-light text-sm">Freelance Designer</p>
                                </div>
                            </div>
                        </div>

                        <div className="notion-block">
                            <div className="flex items-center mb-4">
                                <div className="text-yellow-400 flex">
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star" aria-hidden="true"></i>
                                    <i className="fa fa-star-half-o" aria-hidden="true"></i>
                                </div>
                            </div>
                            <p className="text-notion-light mb-6">"Notion has become the backbone of our company's knowledge base. It's easy to use, and the ability to customize everything is a game-changer."</p>
                            <div className="flex items-center">
                                <div className="h-10 w-10 bg-gray-300 dark:bg-gray-600 rounded-full mr-3"></div>
                                <div>
                                    <h4 className="text-notion font-medium">David Kim</h4>
                                    <p className="text-notion-light text-sm">CEO, Startup Inc.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="pricing" className="py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-notion mb-4">Simple, transparent pricing</h2>
                        <p className="text-lg text-notion-light max-w-3xl mx-auto">Choose the plan that's right for you. All plans include a 14-day free trial.</p>

                        <div className="flex justify-center mt-8">
                            <div className=" bg-muted/50 rounded-full p-1 inline-flex">
                                <button className="pricing-toggle active px-4 py-2 rounded-full text-sm font-medium" data-plan="monthly">Monthly</button>
                                <button className="pricing-toggle px-4 py-2 rounded-full text-sm font-medium" data-plan="yearly">Yearly <span className="text-green-600 dark:text-green-400 text-xs">Save 20%</span></button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="notion-block">
                            <h3 className="text-xl font-semibold text-notion mb-2">Personal</h3>
                            <p className="text-notion-light mb-6">Perfect for individuals</p>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-notion monthly-price">$0</span>
                                <span className="text-4xl font-bold text-notion yearly-price hidden">$0</span>
                                <span className="text-notion-light">/month</span>
                            </div>
                            <ul className="mb-8">
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Unlimited blocks</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Up to 5 guests</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Basic templates</span>
                                </li>
                                <li className="flex items-start text-gray-400">
                                    <i className="fa fa-times mt-1 mr-2" aria-hidden="true"></i>
                                    <span>Advanced databases</span>
                                </li>
                                <li className="flex items-start text-gray-400">
                                    <i className="fa fa-times mt-1 mr-2" aria-hidden="true"></i>
                                    <span>Team collaboration</span>
                                </li>
                            </ul>
                            <Button className="w-full" variant="outline">Get started for free</Button>
                        </div>

                        <div className="notion-block border-primary relative">
                            <div className="absolute text-[16px] top-0 right-0 text-xs font-medium px-3 py-1 rounded-bl-md">
                                Popular
                            </div>
                            <h3 className="text-xl font-semibold text-notion mb-2">Plus</h3>
                            <p className="text-notion-light mb-6">For power users</p>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-notion monthly-price">$10</span>
                                <span className="text-4xl font-bold text-notion yearly-price hidden">$8</span>
                                <span className="text-notion-light">/month</span>
                            </div>
                            <ul className="mb-8">
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Everything in Personal</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Unlimited guests</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Advanced databases</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Custom templates</span>
                                </li>
                                <li className="flex items-start text-gray-400">
                                    <i className="fa fa-times mt-1 mr-2" aria-hidden="true"></i>
                                    <span>Team analytics</span>
                                </li>
                            </ul>
                            <Button className="w-full" >Upgrade to Plus</Button>
                        </div>

                        <div className="notion-block">
                            <h3 className="text-xl font-semibold text-notion mb-2">Business</h3>
                            <p className="text-notion-light mb-6">For teams</p>
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-notion monthly-price">$18</span>
                                <span className="text-4xl font-bold text-notion yearly-price hidden">$14.40</span>
                                <span className="text-notion-light">/month</span>
                            </div>
                            <ul className="mb-8">
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Everything in Plus</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Team collaboration</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Admin controls</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Security features</span>
                                </li>
                                <li className="flex items-start mb-3">
                                    <i className="fa fa-check text-green-500 mt-1 mr-2" aria-hidden="true"></i>
                                    <span className="text-notion-light">Team analytics</span>
                                </li>
                            </ul>
                            <Button className="w-full" variant="outline">Upgrade to Business</Button>
                        </div>
                    </div>
                </div>
            </section>

            <section className="py-16 bg-opacity-10 dark:bg-opacity-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h2 className="text-3xl font-bold text-notion mb-4">Ready to transform how you work?</h2>
                    <p className="text-lg text-notion-light max-w-3xl mx-auto mb-8">Join millions of users who are using Notion to organize their work and life.</p>
                    <Button className="">Get started for free</Button>
                </div>
            </section>

            <footer className="border-t border-gray-200 dark:border-gray-700 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
                        <div className="col-span-2">
                            <div className="flex items-center mb-4">
                                <img className="h-8 w-auto" src="https://p3-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/db52835a91294c1995afd744e9c2df91~tplv-a9rns2rl98-image.image?rcl=20251011093920F1590232204D8A60C141&rk3s=8e244e95&rrcfp=f06b921b&x-expires=1762738781&x-signature=%2FxikC6RAqb%2FUZ8aGUsDWvEvIUxc%3D" alt="Notion Logo" />
                                <span className="ml-2 text-xl font-semibold text-notion">Notion</span>
                            </div>
                            <p className="text-notion-light mb-4">All-in-one workspace for your notes, tasks, wikis, and databases.</p>
                            <div className="flex space-x-4">
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-twitter" aria-hidden="true"></i>
                                </a>
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-facebook" aria-hidden="true"></i>
                                </a>
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-instagram" aria-hidden="true"></i>
                                </a>
                                <a href="#" className="text-notion-light hover:text-notion">
                                    <i className="fa fa-linkedin" aria-hidden="true"></i>
                                </a>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-notion font-medium mb-4">Product</h3>
                            <ul className="space-y-2">
                                <li><a href="#" className="text-notion-light hover:text-notion">Features</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Templates</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Pricing</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Integrations</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Enterprise</a></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-notion font-medium mb-4">Resources</h3>
                            <ul className="space-y-2">
                                <li><a href="#" className="text-notion-light hover:text-notion">Documentation</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Guides</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">API Reference</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Community</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Blog</a></li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-notion font-medium mb-4">Company</h3>
                            <ul className="space-y-2">
                                <li><a href="#" className="text-notion-light hover:text-notion">About</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Careers</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Contact</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Press</a></li>
                                <li><a href="#" className="text-notion-light hover:text-notion">Legal</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="border-t border-gray-200 dark:border-gray-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
                        <p className="text-notion-light text-sm mb-4 md:mb-0">© 2025 Notion. All rights reserved.</p>
                        <div className="flex space-x-6">
                            <a href="#" className="text-notion-light hover:text-notion text-sm">Terms of Service</a>
                            <a href="#" className="text-notion-light hover:text-notion text-sm">Privacy Policy</a>
                            <a href="#" className="text-notion-light hover:text-notion text-sm">Cookie Policy</a>
                        </div>
                    </div>
                </div>
            </footer>
    </>

};